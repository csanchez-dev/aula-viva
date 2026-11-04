import { CreateTopicSchema, NOTES_MAX_CHARS, NOTES_MIN_CHARS } from "@aula-viva/shared";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { api, errorText, waitForJob } from "../../api/client";
import { navigate } from "../../lib/router";

const SUBJECTS = [
  "Anatomía", "Bioquímica", "Farmacología", "Fisiología", "Histología", "Microbiología",
  "Patología", "Semiología", "Medicina interna", "Cirugía", "Pediatría", "Ginecología y obstetricia", "Psiquiatría",
];

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Phase = { kind: "editing" } | { kind: "reading" } | { kind: "generating"; seconds: number };

export function NewTopicPage({ onUsage }: { onUsage: () => void }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setInfo("");
    if (file.size > MAX_PDF_BYTES) return setError("El PDF no puede pasar de 10 MB.");
    setPhase({ kind: "reading" });
    try {
      const result = await api.extractPdf(file.name, await toBase64(file));
      setNotes(result.text);
      if (!title) setTitle(file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 120));
      setInfo(
        `Leídas ${result.pages} página${result.pages === 1 ? "" : "s"}.` +
          (result.truncated ? ` El texto se recortó a ${NOTES_MAX_CHARS.toLocaleString("es")} caracteres: divide el PDF en temas más pequeños.` : "") +
          " Revisa el texto y quita lo que no quieras estudiar (índices, bibliografía…).",
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPhase({ kind: "editing" });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = CreateTopicSchema.safeParse({ title, subject, notes });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa el formulario.");
    setPhase({ kind: "generating", seconds: 0 });
    const started = Date.now();
    const timer = window.setInterval(() => setPhase({ kind: "generating", seconds: Math.round((Date.now() - started) / 1000) }), 1000);
    try {
      const { topicId, job } = await api.createTopic(parsed.data);
      onUsage();
      // Si la generación falla, la página del tema lo muestra y permite reintentar.
      await waitForJob(job.id);
      navigate({ name: "topic", id: topicId });
    } catch (err) {
      setError(errorText(err));
      setPhase({ kind: "editing" });
    } finally {
      window.clearInterval(timer);
      onUsage();
    }
  }

  if (phase.kind === "generating") {
    const step = phase.seconds < 4 ? "Leyendo tus apuntes…" : phase.seconds < 20 ? "Creando tarjetas y preguntas…" : "Revisando que cada tarjeta cite su fragmento…";
    return (
      <section className="panel center tall" aria-live="polite">
        <div className="thinking">
          <i /> <i /> <i />
        </div>
        <h2>{step}</h2>
        <p className="hint">Suele tardar entre 15 segundos y 2 minutos según la longitud de los apuntes ({phase.seconds} s).</p>
      </section>
    );
  }

  const length = notes.trim().length;
  return (
    <form className="panel form-page" onSubmit={submit} noValidate>
      <div>
        <p className="eyebrow">Nuevo tema</p>
        <h1>Sube tus apuntes</h1>
        <p className="lead">La IA solo usará lo que pegues aquí. Cada tarjeta mostrará el fragmento de donde sale para que puedas comprobarla.</p>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="title">Tema</label>
          <input id="title" type="text" maxLength={120} placeholder="Ej.: Manejo farmacológico de la HPB" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="subject">Asignatura</label>
          <input id="subject" type="text" list="subjects" maxLength={60} placeholder="Ej.: Farmacología" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <datalist id="subjects">
            {SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="notes">Apuntes</label>
          <button type="button" className="ghost small" onClick={() => fileInput.current?.click()} disabled={phase.kind === "reading"}>
            {phase.kind === "reading" ? "Leyendo PDF…" : "Subir PDF"}
          </button>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void onPdf(e)} />
        </div>
        <textarea
          id="notes"
          rows={16}
          placeholder="Pega aquí tus apuntes de un tema: definiciones, mecanismos, tablas de fármacos, criterios…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="field-foot">
          <span className={length > 0 && length < NOTES_MIN_CHARS ? "warn-text" : "hint"}>
            {length.toLocaleString("es")} / {NOTES_MAX_CHARS.toLocaleString("es")} caracteres
            {length > 0 && length < NOTES_MIN_CHARS ? ` · mínimo ${NOTES_MIN_CHARS}` : ""}
          </span>
          {info && <span className="hint">{info}</span>}
        </div>
      </div>

      <p className="status err" role="alert">
        {error}
      </p>
      <div className="row end">
        <button className="primary big" type="submit" disabled={phase.kind === "reading"}>
          Crear tarjetas con IA
        </button>
      </div>
    </form>
  );
}
