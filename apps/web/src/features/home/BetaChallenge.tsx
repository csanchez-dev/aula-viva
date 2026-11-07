import type { BetaStatus } from "@aula-viva/shared";

/** Encuesta final de la beta: se muestra al llegar al último día del reto. */
const SURVEY_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdgFwdwsvBOYqno2XcBc_ssU3lc-gHR63PIX7uia6dikS11UA/viewform";

const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Bienvenida al programa beta y reto diario: una meta pequeña, visible y fácil de cumplir. */
export function BetaChallenge({ beta, name, pending }: { beta: BetaStatus; name: string; pending: number }) {
  const left = Math.max(0, beta.goal - beta.reviewedToday);
  const today = beta.days[beta.day - 1];
  const lastDay = beta.day >= beta.totalDays;
  const daysDone = beta.days.filter((d) => d.done).length;
  return (
    <section className="panel beta-card" aria-label="Reto diario de la beta">
      <p className="beta-pill">
        <i aria-hidden="true" /> Te damos la bienvenida, betatester
      </p>
      <div className="beta-head">
        <h2>{name ? `${name}, hoy es el día ${beta.day} de ${beta.totalDays}` : `Día ${beta.day} de ${beta.totalDays}`}</h2>
        <p className="beta-streak">
          <strong>{beta.streak}</strong> {beta.streak === 1 ? "día seguido" : "días seguidos"}
        </p>
      </div>
      <p className="lead">
        {left > 0 && pending === 0
          ? "No te quedan tarjetas por repasar. Crea un tema nuevo para seguir sumando hoy."
          : left > 0
          ? `Repasa ${left} ${left === 1 ? "tarjeta más" : "tarjetas más"} para cumplir hoy. Solo funciona si vuelves cada día.`
          : "Reto de hoy cumplido. Vuelve mañana: ahí es cuando el repaso espaciado hace su trabajo."}
      </p>
      <ol className="beta-days" style={{ gridTemplateColumns: `repeat(${beta.days.length}, minmax(0, 1fr))` }}>
        {beta.days.map((d, i) => (
          <li key={d.date} className={`${d.done ? "done" : ""}${d === today ? " today" : ""}${i >= beta.day ? " later" : ""}`}>
            <span className="beta-dot" aria-hidden="true">{d.done ? "✓" : i + 1}</span>
            <span className="beta-label">{label(d.date)}</span>
            <span className="sr-only">{d.done ? "cumplido" : "sin cumplir"}</span>
          </li>
        ))}
      </ol>
      {lastDay && (
        <div className="beta-survey">
          <p>
            <strong>Último día del reto.</strong>{" "}
            {daysDone > 0
              ? `Cumpliste ${daysDone} de ${beta.totalDays} días. Cuéntanos cómo te fue: son 5 minutos y deciden qué mejoramos.`
              : "Cuéntanos cómo te fue: son 5 minutos y deciden qué mejoramos."}
          </p>
          <a className="button primary" href={SURVEY_URL} target="_blank" rel="noreferrer">
            Responder la encuesta
          </a>
        </div>
      )}
    </section>
  );
}
