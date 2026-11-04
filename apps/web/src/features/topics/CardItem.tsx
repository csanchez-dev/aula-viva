import type { Card } from "@aula-viva/shared";
import { type FormEvent, useState } from "react";
import { api, errorText } from "../../api/client";

const STATE_LABEL: Record<Card["state"], string> = {
  new: "Sin estudiar",
  learning: "Aprendiendo",
  relearning: "Reaprendiendo",
  review: "En repaso",
};

/** Una tarjeta en la lista del tema: ver, comprobar su fragmento, editar, suspender o borrar. */
export function CardItem({ card, onChange, onDelete }: { card: Card; onChange: (c: Card) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [options, setOptions] = useState(card.options ?? []);
  const [answer, setAnswer] = useState(card.answerIndex ?? 0);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const patch = card.kind === "question" ? { front, back, options, answerIndex: answer } : { front, back };
      const { card: updated } = await api.updateCard(card.id, patch);
      onChange(updated);
      setEditing(false);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function toggleSuspend() {
    try {
      onChange((await api.updateCard(card.id, { suspended: !card.suspended })).card);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    try {
      await api.deleteCard(card.id);
      onDelete(card.id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (editing) {
    return (
      <li className="card-item editing">
        <form onSubmit={save} className="stack">
          <label htmlFor={`f-${card.id}`}>{card.kind === "question" ? "Enunciado" : "Pregunta"}</label>
          <textarea id={`f-${card.id}`} rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
          {card.kind === "question" && (
            <fieldset className="options-edit">
              <legend>Opciones (marca la correcta)</legend>
              {options.map((o, i) => (
                <div key={i} className="option-edit">
                  <input type="radio" name={`a-${card.id}`} checked={answer === i} onChange={() => setAnswer(i)} aria-label={`Opción ${i + 1} correcta`} />
                  <input type="text" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              ))}
            </fieldset>
          )}
          <label htmlFor={`b-${card.id}`}>{card.kind === "question" ? "Explicación" : "Respuesta"}</label>
          <textarea id={`b-${card.id}`} rows={3} value={back} onChange={(e) => setBack(e.target.value)} />
          {error && <p className="status err">{error}</p>}
          <div className="row end">
            <button type="button" className="ghost small" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button type="submit" className="primary small">
              Guardar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`card-item${card.suspended ? " suspended" : ""}`}>
      <div className="card-meta">
        <span className={`kind kind-${card.kind}`}>{card.kind === "question" ? "Pregunta" : "Flashcard"}</span>
        <span className="hint">{STATE_LABEL[card.state]}</span>
      </div>
      <p className="card-front">{card.front}</p>
      {card.kind === "question" && card.options ? (
        <ol className="options-view">
          {card.options.map((o, i) => (
            <li key={i} className={i === card.answerIndex ? "correct" : undefined}>
              {o}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="card-back">{card.back}</p>
      {showSource && card.source && (
        <blockquote className="source">
          <span className="source-label">Fragmento {card.source.position} de tus apuntes</span>
          {card.source.text}
        </blockquote>
      )}
      <div className="card-actions">
        {card.source && (
          <button className="link" onClick={() => setShowSource((s) => !s)}>
            {showSource ? "Ocultar fragmento" : `Ver fragmento ${card.source.position}`}
          </button>
        )}
        <span className="spacer" />
        <button className="link" onClick={() => setEditing(true)}>
          Editar
        </button>
        <button className="link" onClick={() => void toggleSuspend()}>
          {card.suspended ? "Reactivar" : "Suspender"}
        </button>
        <button className="link danger-text" onClick={() => void remove()}>
          Borrar
        </button>
      </div>
      {error && <p className="status err">{error}</p>}
    </li>
  );
}
