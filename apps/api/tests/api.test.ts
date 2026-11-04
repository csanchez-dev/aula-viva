import { type CompletionRequest, type LlmClient, LlmUnavailableError } from "@aula-viva/ai";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/interfaces/http/app";
import { buildTestDeps } from "./in-memory";

const student = { name: "Ana Pérez", email: "ana@uni.es", password: "corazon12345" };

const NOTES = [
  "La hiperplasia prostática benigna produce síntomas obstructivos e irritativos del tracto urinario inferior.",
  "La tamsulosina es un antagonista de los receptores alfa-1 que relaja el músculo liso prostático y mejora el flujo urinario en pocos días.",
  "La finasterida inhibe la enzima 5-alfa reductasa tipo 2 y reduce el volumen prostático después de seis meses de tratamiento continuado.",
  "En la vejiga hiperactiva se usan antimuscarínicos como la oxibutinina, que pueden causar sequedad de boca y estreñimiento.",
].join("\n\n");

async function signedIn(options?: Parameters<typeof buildTestDeps>[0]) {
  const ctx = buildTestDeps(options);
  const agent = request.agent(createApp(ctx.deps));
  await agent.post("/api/auth/register").send(student).expect(201);

  /** Crea un tema, deja que la IA termine y devuelve el id del tema y el trabajo final. */
  const createTopic = async (body: object = { title: "Manejo de la HPB", subject: "Farmacología", notes: NOTES }) => {
    const res = await agent.post("/api/topics").send(body).expect(202);
    expect(res.body.job.status).toBe("pending");
    await ctx.background.flush();
    const job = (await agent.get(`/api/jobs/${res.body.job.id}`).expect(200)).body.job;
    return { topicId: res.body.topicId as string, job };
  };
  return { agent, createTopic, ...ctx };
}

describe("autenticación", () => {
  it("registra, guarda la sesión en una cookie httpOnly y devuelve el perfil", async () => {
    const { deps } = buildTestDeps();
    const agent = request.agent(createApp(deps));
    const res = await agent.post("/api/auth/register").send(student).expect(201);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(String(res.headers["set-cookie"])).toMatch(/av_session=.*HttpOnly/i);
    expect((await agent.get("/api/me").expect(200)).body.usage).toMatchObject({ used: 0, limit: 5 });
  });

  it("da el mismo error con correo inexistente o contraseña errónea", async () => {
    const { agent } = await signedIn();
    const a = await agent.post("/api/auth/login").send({ email: "nadie@uni.es", password: "x" }).expect(401);
    const b = await agent.post("/api/auth/login").send({ email: student.email, password: "mala" }).expect(401);
    expect([a.body.error.code, b.body.error.code]).toEqual(["INVALID_CREDENTIALS", "INVALID_CREDENTIALS"]);
  });

  it("protege las rutas privadas", async () => {
    await request(createApp(buildTestDeps().deps)).get("/api/dashboard").expect(401);
  });
});

describe("temas y generación de tarjetas", () => {
  it("crea un tema, divide los apuntes y genera tarjetas que citan su fragmento", async () => {
    const { agent, createTopic } = await signedIn();
    const { topicId, job } = await createTopic();
    expect(job.status).toBe("done");
    expect(job.cardsCreated).toBeGreaterThan(0);

    const detail = (await agent.get(`/api/topics/${topicId}`).expect(200)).body;
    expect(detail.topic.title).toBe("Manejo de la HPB");
    expect(detail.topic.progress.fresh).toBe(detail.cards.length);
    expect(detail.cards.every((c: { source: { position: number; text: string } }) => c.source && c.source.text.length > 0)).toBe(true);
    expect(detail.cards.some((c: { kind: string }) => c.kind === "question")).toBe(true);
  });

  it("rechaza apuntes demasiado cortos", async () => {
    const { agent } = await signedIn();
    const res = await agent.post("/api/topics").send({ title: "HPB", subject: "Farmacología", notes: "muy corto" }).expect(400);
    expect(res.body.error.message).toMatch(/al menos 200/);
  });

  it("si la IA falla, el trabajo queda fallido y la cuota se devuelve", async () => {
    const broken: LlmClient = { complete: async (_r: CompletionRequest) => { throw new LlmUnavailableError("caído"); } };
    const { agent, createTopic } = await signedIn({ llm: broken });
    const { job } = await createTopic();
    expect(job).toMatchObject({ status: "failed", errorCode: "AI_UNAVAILABLE" });
    expect((await agent.get("/api/me")).body.usage.used).toBe(0);
  });

  it("respeta la cuota diaria del plan gratuito", async () => {
    const { agent, createTopic } = await signedIn({ freePerDay: 1 });
    const { topicId } = await createTopic();
    const res = await agent.post(`/api/topics/${topicId}/generate`).expect(429);
    expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("generar más no repite tarjetas que ya existen", async () => {
    const { agent, createTopic, background } = await signedIn();
    const { topicId, job } = await createTopic();
    const more = await agent.post(`/api/topics/${topicId}/generate`).expect(202);
    await background.flush();
    const second = (await agent.get(`/api/jobs/${more.body.job.id}`)).body.job;
    expect(job.cardsCreated).toBeGreaterThan(0);
    expect(second.cardsCreated).toBe(0); // el simulador genera las mismas: se descartan
  });

  it("extrae el texto de un PDF y rechaza archivos que no lo son", async () => {
    const { agent } = await signedIn();
    const pdf = Buffer.from(`%PDF-1.7\n${NOTES}`).toString("base64");
    const ok = await agent.post("/api/notes/extract").send({ fileName: "hpb.pdf", dataBase64: pdf }).expect(200);
    expect(ok.body.text).toContain("tamsulosina");
    const bad = await agent.post("/api/notes/extract").send({ fileName: "x.pdf", dataBase64: Buffer.from("hola").toString("base64") }).expect(400);
    expect(bad.body.error.message).toMatch(/no es un PDF/);
  });

  it("nadie puede ver el tema de otra persona", async () => {
    const { deps, createTopic } = await signedIn();
    const { topicId } = await createTopic();
    const other = request.agent(createApp(deps));
    await other.post("/api/auth/register").send({ ...student, email: "luis@uni.es" }).expect(201);
    await other.get(`/api/topics/${topicId}`).expect(404);
  });
});

describe("repaso espaciado", () => {
  it("la cola trae tarjetas nuevas con el intervalo de cada botón", async () => {
    const { agent, createTopic } = await signedIn();
    await createTopic();
    const queue = (await agent.get("/api/review/queue").expect(200)).body;
    expect(queue.cards.length).toBeGreaterThan(0);
    expect(queue.cards[0].intervals).toMatchObject({ 1: expect.any(String), 3: expect.any(String), 4: expect.any(String) });
  });

  it("una tarjeta bien recordada vuelve días después; una olvidada, en minutos", async () => {
    const { agent, createTopic, clock } = await signedIn();
    await createTopic();
    const [first, second] = (await agent.get("/api/review/queue")).body.cards;
    const easy = (await agent.post(`/api/cards/${first.id}/review`).send({ rating: 4 }).expect(200)).body.card;
    const again = (await agent.post(`/api/cards/${second.id}/review`).send({ rating: 1 }).expect(200)).body.card;
    const hours = (iso: string) => (new Date(iso).getTime() - clock.now().getTime()) / 3_600_000;
    expect(hours(easy.due)).toBeGreaterThan(24);
    expect(hours(again.due)).toBeLessThan(1);

    const dash = (await agent.get("/api/dashboard")).body;
    expect(dash.reviewedToday).toBe(2);

    // Pasan diez días: la tarjeta fácil ya vence y aparece primero en la cola.
    clock.advanceDays(10);
    const later = (await agent.get("/api/review/queue")).body;
    expect(later.dueCount).toBeGreaterThanOrEqual(2);
    expect(later.cards.map((c: { id: string }) => c.id)).toContain(first.id);
  });

  it("rechaza valoraciones fuera de 1 a 4", async () => {
    const { agent, createTopic } = await signedIn();
    await createTopic();
    const [card] = (await agent.get("/api/review/queue")).body.cards;
    await agent.post(`/api/cards/${card.id}/review`).send({ rating: 7 }).expect(400);
  });

  it("permite corregir, suspender y borrar tarjetas", async () => {
    const { agent, createTopic } = await signedIn();
    const { topicId } = await createTopic();
    const cards = (await agent.get(`/api/topics/${topicId}`)).body.cards;
    const flash = cards.find((c: { kind: string }) => c.kind === "flashcard");
    const edited = (await agent.patch(`/api/cards/${flash.id}`).send({ back: "Respuesta corregida" }).expect(200)).body.card;
    expect(edited.back).toBe("Respuesta corregida");
    await agent.patch(`/api/cards/${flash.id}`).send({ options: ["a", "b"] }).expect(400);
    await agent.patch(`/api/cards/${flash.id}`).send({ suspended: true }).expect(200);
    const queue = (await agent.get(`/api/review/queue?topicId=${topicId}`)).body;
    expect(queue.cards.map((c: { id: string }) => c.id)).not.toContain(flash.id);
    await agent.delete(`/api/cards/${flash.id}`).expect(204);
    await agent.delete(`/api/cards/${flash.id}`).expect(404);
  });

  it("el simulacro devuelve solo preguntas tipo test del tema", async () => {
    const { agent, createTopic } = await signedIn();
    const { topicId } = await createTopic();
    const { questions } = (await agent.get(`/api/topics/${topicId}/quiz`).expect(200)).body;
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q: { kind: string; options: string[] }) => q.kind === "question" && q.options.length >= 3)).toBe(true);
  });

  it("borrar un tema borra sus tarjetas de la cola", async () => {
    const { agent, createTopic } = await signedIn();
    const { topicId } = await createTopic();
    await agent.delete(`/api/topics/${topicId}`).expect(204);
    expect((await agent.get("/api/review/queue")).body.cards).toHaveLength(0);
  });
});

describe("administración", () => {
  it("solo un admin puede cambiar el plan de un usuario", async () => {
    const { agent, users } = await signedIn();
    const user = [...users.rows.values()][0]!;
    await agent.patch(`/api/admin/users/${user.id}/plan`).send({ plan: "pro" }).expect(403);
    user.role = "admin";
    await agent.post("/api/auth/login").send({ email: student.email, password: student.password }).expect(200);
    expect((await agent.patch(`/api/admin/users/${user.id}/plan`).send({ plan: "pro" }).expect(200)).body.user.plan).toBe("pro");
  });
});
