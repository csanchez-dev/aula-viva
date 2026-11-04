import { type QueueCard, RATING_LABELS, type Rating } from "@aula-viva/shared";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../../api/client";
import { href } from "../../lib/router";

const RATINGS: Rating[] = [1, 2, 3, 4];

/**
 * Sesión de repaso: muestra la tarjeta, el estudiante intenta recordar, ve la respuesta y valora
 * cuánto le costó. FSRS decide con esa valoración cuándo vuelve a aparecer.
 * Atajos: espacio = mostrar respuesta; 1-4 = valorar (o elegir opción en las preguntas).
 */
export function ReviewPage({ topicId }: { topicId?: string }) {
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [done, setDone] = useState({ total: 0, remembered: 0, again: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const q = await api.queue(topicId);
      setQueue(q.cards);
      setIndex(0);
    } catch (e) {
      setError(errorText(e));
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = queue?.[index];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await api.review(card.id, rating);
        setDone((d) => ({ total: d.total + 1, remembered: d.remembered + (rating > 1 ? 1 : 0), again: d.again + (rating === 1 ? 1 : 0) }));
        setRevealed(false);
        setPicked(null);
        setShowSource(false);
        if (queue && index + 1 < queue.length) setIndex(index + 1);
        else await load(); // las tarjetas en aprendizaje vuelven a los pocos minutos
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [card, busy, queue, index, load],
  );

  const pick = useCallback(
    (i: number) => {
      if (!card || revealed) return;
      setPicked(i);
      setRevealed(true);
    },
    [card, revealed],
  );

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === " " && !revealed && card.kind === "flashcard") {
        e.preventDefault();
        setRevealed(true);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const n = Number(e.key);
        if (revealed) void rate(n as Rating);
        else if (card.kind === "question" && card.options && n <= card.options.length) pick(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, rate, pick]);

  if (error) return <p className="status err">{error}</p>;
  if (!queue) return <div className="skeleton" aria-busy="true" />;

  if (!card) {
    return (
      <section className="panel center tall">
        <p className="eyebrow">Sesión terminada</p>
        <h1>{done.total > 0 ? `${done.total} tarjetas repasadas` : "No hay nada pendiente"}</h1>
        {done.total > 0 && (
          <p className="lead">
            Recordaste {done.remembered} de {done.total} ({Math.round((done.remembered / done.total) * 100)} %). Lo que te costó volverá
            antes; lo que dominas, dentro de unos días.
          </p>
        )}
        {done.again > 0 && (
          <p className="hint">
            Las tarjetas que marcaste «Otra vez» vuelven en unos minutos.{" "}
            <button className="link" onClick={() => void load()}>
              Comprobar ahora
            </button>
          </p>
        )}
        <a className="button primary" href={href(topicId ? { name: "topic", id: topicId } : { name: "home" })}>
          {topicId ? "Volver al tema" : "Volver a Hoy"}
        </a>
      </section>
    );
  }

  const correct = card.kind === "question" && picked !== null && picked === card.answerIndex;
  const suggested: Rating | null = card.kind === "question" && revealed ? (correct ? 3 : 1) : null;

  return (
    <section className="review">
      <div className="review-head">
        <a className="back" href={href(topicId ? { name: "topic", id: topicId } : { name: "home" })}>
          ← Salir
        </a>
        <span className="meta">
          {index + 1} de {queue.length}
          {card.state === "new" ? " · nueva" : ""}
        </span>
      </div>
      <div className="progress-line" aria-hidden="true">
        <i style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <article className="panel review-card" aria-live="polite">
        <p className="kind-label">{card.kind === "question" ? "Pregunta tipo examen" : "Flashcard"}</p>
        <h2 className="review-front">{card.front}</h2>

        {card.kind === "question" && card.options && (
          <ol className="options">
            {card.options.map((o, i) => {
              const state = !revealed ? "" : i === card.answerIndex ? " right" : i === picked ? " wrong" : "";
              return (
                <li key={i}>
                  <button className={`opt${state}`} disabled={revealed} onClick={() => pick(i)}>
                    <span className="key">{i + 1}</span>
                    {o}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {revealed ? (
          <div className="answer">
            {card.kind === "question" && <p className={`verdict ${correct ? "ok" : "bad"}`}>{correct ? "¡Correcto!" : "No es esa."}</p>}
            <p className="review-back">{card.back}</p>
            {card.source && (
              <>
                <button className="link" onClick={() => setShowSource((s) => !s)}>
                  {showSource ? "Ocultar mis apuntes" : "Ver en mis apuntes"}
                </button>
                {showSource && (
                  <blockquote className="source">
                    <span className="source-label">Fragmento {card.source.position}</span>
                    {card.source.text}
                  </blockquote>
                )}
              </>
            )}
          </div>
        ) : (
          card.kind === "flashcard" && (
            <button className="primary big reveal" onClick={() => setRevealed(true)}>
              Mostrar respuesta <span className="kbd">espacio</span>
            </button>
          )
        )}
      </article>

      {revealed && (
        <div className="ratings" role="group" aria-label="¿Cuánto te costó recordarla?">
          {RATINGS.map((r) => (
            <button key={r} className={`rate rate-${r}${suggested === r ? " suggested" : ""}`} disabled={busy} onClick={() => void rate(r)}>
              <span className="rate-label">{RATING_LABELS[r]}</span>
              <span className="rate-when">{card.intervals[r]}</span>
              <span className="kbd">{r}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
