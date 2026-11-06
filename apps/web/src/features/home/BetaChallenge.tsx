import type { BetaStatus } from "@aula-viva/shared";

const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Bienvenida al programa beta y reto diario: una meta pequeña, visible y fácil de cumplir. */
export function BetaChallenge({ beta, name, pending }: { beta: BetaStatus; name: string; pending: number }) {
  const left = Math.max(0, beta.goal - beta.reviewedToday);
  const today = beta.days[beta.day - 1];
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
      <ol className="beta-days">
        {beta.days.map((d, i) => (
          <li key={d.date} className={`${d.done ? "done" : ""}${d === today ? " today" : ""}${i >= beta.day ? " later" : ""}`}>
            <span className="beta-dot" aria-hidden="true">{d.done ? "✓" : i + 1}</span>
            <span className="beta-label">{label(d.date)}</span>
            <span className="sr-only">{d.done ? "cumplido" : "sin cumplir"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
