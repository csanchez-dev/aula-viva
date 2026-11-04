import type { Card } from "@aula-viva/shared";
import { useEffect, useState } from "react";
import { api, errorText } from "../../api/client";
import { href } from "../../lib/router";

/** Simulacro: todas las preguntas del tema, con explicación. No cambia la planificación de repasos. */
export function QuizPage({ id }: { id: string }) {
  const [questions, setQuestions] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");

  const start = () => {
    setQuestions(null);
    setIndex(0);
    setScore(0);
    setPicked(null);
    api.quiz(id).then((r) => setQuestions(r.questions), (e) => setError(errorText(e)));
  };
  useEffect(start, [id]);

  if (error) return <p className="status err">{error}</p>;
  if (!questions) return <div className="skeleton" aria-busy="true" />;

  const back = (
    <a className="back" href={href({ name: "topic", id })}>
      ← Volver al tema
    </a>
  );
  const q = questions[index];

  if (!q) {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <section className="panel center tall">
        <p className="eyebrow">Simulacro terminado</p>
        <h1>
          {score} de {questions.length} <span className="muted">({pct} %)</span>
        </h1>
        <p className="lead">{pct >= 80 ? "Muy bien. Mantén el repaso diario." : "Repasa el tema: las preguntas falladas te dicen por dónde empezar."}</p>
        <div className="row">
          <button className="primary" onClick={start}>
            Repetir con otro orden
          </button>
          <a className="button ghost" href={href({ name: "review", topicId: id })}>
            Repasar el tema
          </a>
        </div>
      </section>
    );
  }

  const answered = picked !== null;
  return (
    <section className="review">
      <div className="review-head">
        {back}
        <span className="meta">
          Pregunta {index + 1} de {questions.length} · {score} aciertos
        </span>
      </div>
      <div className="progress-line" aria-hidden="true">
        <i style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <article className="panel review-card">
        <p className="kind-label">Simulacro</p>
        <h2 className="review-front">{q.front}</h2>
        <ol className="options">
          {(q.options ?? []).map((o, i) => {
            const state = !answered ? "" : i === q.answerIndex ? " right" : i === picked ? " wrong" : "";
            return (
              <li key={i}>
                <button
                  className={`opt${state}`}
                  disabled={answered}
                  onClick={() => {
                    setPicked(i);
                    if (i === q.answerIndex) setScore((s) => s + 1);
                  }}
                >
                  <span className="key">{i + 1}</span>
                  {o}
                </button>
              </li>
            );
          })}
        </ol>
        {answered && (
          <div className="answer">
            <p className={`verdict ${picked === q.answerIndex ? "ok" : "bad"}`}>{picked === q.answerIndex ? "¡Correcto!" : "No es esa."}</p>
            <p className="review-back">{q.back}</p>
            <div className="row end">
              <button
                className="primary"
                autoFocus
                onClick={() => {
                  setIndex((i) => i + 1);
                  setPicked(null);
                }}
              >
                {index + 1 < questions.length ? "Siguiente" : "Ver resultado"}
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
