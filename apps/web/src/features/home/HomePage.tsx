import type { Dashboard, TopicProgress } from "@aula-viva/shared";
import { useEffect, useState } from "react";
import { api, errorText } from "../../api/client";
import { href } from "../../lib/router";
import { ProgressBar } from "../topics/ProgressBar";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pantalla "Hoy": lo que toca repasar y el estado de cada tema. */
export function HomePage({ name }: { name: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setData, (e) => setError(errorText(e)));
  }, []);

  if (error) return <p className="status err">{error}</p>;
  if (!data) return <div className="skeleton" aria-busy="true" />;

  const toStudy = data.dueNow + data.newAvailable;
  const firstName = name.split(" ")[0];

  if (data.topics.length === 0) {
    return (
      <section className="panel hero empty">
        <p className="eyebrow">Hola, {firstName}</p>
        <h1>Sube tus primeros apuntes</h1>
        <p className="lead">
          Pega el texto o sube el PDF de un tema. La IA lo convierte en tarjetas y preguntas tipo examen, y Aula Viva te pide
          repasar cada día justo lo que estás a punto de olvidar.
        </p>
        <a className="button primary" href={href({ name: "new" })}>
          Crear mi primer tema
        </a>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <section className="panel hero">
        <p className="eyebrow">Hoy · {new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}</p>
        {toStudy > 0 ? (
          <>
            <h1>
              {toStudy === 1 ? "Te toca " : "Te tocan "}
              <span className="num">{toStudy}</span> {toStudy === 1 ? "tarjeta" : "tarjetas"}
            </h1>
            <p className="lead">
              {[
                data.dueNow > 0 ? plural(data.dueNow, "pendiente de repaso", "pendientes de repaso") : null,
                data.newAvailable > 0 ? plural(data.newAvailable, "nueva", "nuevas") : null,
              ]
                .filter(Boolean)
                .join(" y ")}{" "}
              · unos {Math.max(1, Math.round(toStudy * 0.25))} min
            </p>
            <a className="button primary big" href={href({ name: "review" })}>
              Empezar repaso
            </a>
          </>
        ) : (
          <>
            <h1>Estás al día</h1>
            <p className="lead">No te queda nada pendiente. Vuelve mañana o crea un tema nuevo.</p>
          </>
        )}
        {data.reviewedToday > 0 && <p className="hint">Hoy ya has repasado {plural(data.reviewedToday, "tarjeta", "tarjetas")}.</p>}
      </section>

      <section>
        <div className="section-head">
          <h2>Tus temas</h2>
          <a className="button ghost small" href={href({ name: "new" })}>
            + Nuevo tema
          </a>
        </div>
        <ul className="topic-list">
          {data.topics.map((t) => (
            <li key={t.id}>
              <a className="topic-row" href={href({ name: "topic", id: t.id })}>
                <div className="topic-main">
                  <span className="topic-title">{t.title}</span>
                  <span className="topic-subject">{t.subject}</span>
                </div>
                <ProgressBar progress={t.progress} />
                <div className="topic-chips">
                  <TopicChips progress={t.progress} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Estado de un tema en una o dos etiquetas: lo urgente primero. */
function TopicChips({ progress: p }: { progress: TopicProgress }) {
  if (p.total === 0) return <span className="chip">Sin tarjetas</span>;
  const chips = [];
  if (p.fading > 0) chips.push(<span key="f" className="chip fading">{plural(p.fading, "se te olvida", "se te olvidan")}</span>);
  if (p.due > 0) chips.push(<span key="d" className="chip due">{plural(p.due, "pendiente", "pendientes")}</span>);
  if (chips.length === 0 && p.fresh === p.total) chips.push(<span key="n" className="chip">{plural(p.fresh, "sin estudiar", "sin estudiar")}</span>);
  if (chips.length === 0) chips.push(<span key="ok" className="chip ok">Al día{p.mature > 0 ? ` · ${plural(p.mature, "dominada", "dominadas")}` : ""}</span>);
  return <>{chips}</>;
}
