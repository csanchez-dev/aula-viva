import { type Card, ERROR_MESSAGES, type GenerationJob, type Topic } from "@aula-viva/shared";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, waitForJob } from "../../api/client";
import { href, navigate } from "../../lib/router";
import { CardItem } from "./CardItem";
import { ProgressBar } from "./ProgressBar";

type Filter = "all" | "flashcard" | "question" | "suspended";

/** Un tema: progreso, acciones (repasar, simulacro, generar más) y revisión de sus tarjetas. */
export function TopicPage({ id, onUsage }: { id: string; onUsage: () => void }) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.topic(id);
      setTopic(data.topic);
      setCards(data.cards);
      setJob(data.job);
      return data.job;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  }, [id]);

  // Si hay una generación en marcha (por ejemplo, tras recargar la página), se espera a que termine.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await load();
      if (current?.status === "pending") {
        await waitForJob(current.id).catch(() => undefined);
        if (!cancelled) await load();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function generateMore() {
    setStatus("");
    try {
      const { job: started } = await api.generateMore(id);
      setJob(started);
      onUsage();
      const done = await waitForJob(started.id);
      await load();
      setStatus(done.status === "done" ? `${done.cardsCreated} tarjetas nuevas.` : "");
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      onUsage();
    }
  }

  async function remove() {
    try {
      await api.deleteTopic(id);
      navigate({ name: "home" });
    } catch (e) {
      setStatus(errorText(e));
    }
  }

  const replaceCard = (card: Card) => setCards((all) => all.map((c) => (c.id === card.id ? card : c)));
  const dropCard = (cardId: string) => setCards((all) => all.filter((c) => c.id !== cardId));

  if (error) return <p className="status err">{error}</p>;
  if (!topic) return <div className="skeleton" aria-busy="true" />;

  const generating = job?.status === "pending";
  const questions = cards.filter((c) => c.kind === "question" && !c.suspended).length;
  const visible = cards.filter((c) =>
    filter === "all" ? !c.suspended : filter === "suspended" ? c.suspended : c.kind === filter && !c.suspended,
  );
  const toStudy = topic.progress.due + topic.progress.fresh;

  return (
    <div className="stack-lg">
      <section className="panel">
        <a className="back" href={href({ name: "home" })}>
          ← Hoy
        </a>
        <p className="eyebrow">{topic.subject}</p>
        <h1>{topic.title}</h1>
        <ProgressBar progress={topic.progress} legend />
        {topic.progress.fading > 0 && (
          <p className="callout">
            {topic.progress.fading} tarjeta{topic.progress.fading === 1 ? "" : "s"} se te {topic.progress.fading === 1 ? "está" : "están"} olvidando: repásalas hoy.
          </p>
        )}
        <div className="row">
          <a className={`button primary${toStudy === 0 ? " disabled" : ""}`} href={toStudy ? href({ name: "review", topicId: id }) : undefined} aria-disabled={toStudy === 0}>
            Repasar este tema{toStudy ? ` (${toStudy})` : ""}
          </a>
          <a className={`button ghost${questions === 0 ? " disabled" : ""}`} href={questions ? href({ name: "quiz", id }) : undefined} aria-disabled={questions === 0}>
            Simulacro ({questions} preguntas)
          </a>
          <button className="ghost" onClick={() => void generateMore()} disabled={generating}>
            {generating ? "Generando…" : "Generar más tarjetas"}
          </button>
          <span className="spacer" />
          {confirmDelete ? (
            <span className="confirm">
              ¿Borrar el tema y sus {cards.length} tarjetas?
              <button className="danger small" onClick={() => void remove()}>
                Sí, borrar
              </button>
              <button className="ghost small" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button className="ghost small" onClick={() => setConfirmDelete(true)}>
              Borrar tema
            </button>
          )}
        </div>
        {generating && <p className="callout info">La IA está creando tarjetas. Esta página se actualiza sola.</p>}
        {job?.status === "failed" && cards.length === 0 && (
          <p className="callout warn">
            {ERROR_MESSAGES[job.errorCode ?? "AI_UNAVAILABLE"]} Pulsa «Generar más tarjetas» para reintentarlo.
          </p>
        )}
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Tarjetas</h2>
          <div className="tabs" role="group" aria-label="Filtrar tarjetas">
            {(
              [
                ["all", "Todas"],
                ["flashcard", "Flashcards"],
                ["question", "Preguntas"],
                ["suspended", "Suspendidas"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">Revisa las tarjetas antes de estudiarlas: edita lo que no sea exacto y suspende lo que no te interese.</p>
        {visible.length === 0 ? (
          <p className="empty-note">{generating ? "Las tarjetas aparecerán aquí en cuanto estén listas." : "No hay tarjetas en esta vista."}</p>
        ) : (
          <ul className="card-list">
            {visible.map((c) => (
              <CardItem key={c.id} card={c} onChange={replaceCard} onDelete={dropCard} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
