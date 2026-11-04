import type { TopicProgress } from "@aula-viva/shared";

const SEGMENTS: { key: "mature" | "young" | "learning" | "fresh"; label: string }[] = [
  { key: "mature", label: "Dominadas" },
  { key: "young", label: "En repaso" },
  { key: "learning", label: "Aprendiendo" },
  { key: "fresh", label: "Sin estudiar" },
];

/** Barra de progreso de un tema: de dominadas (izquierda) a sin estudiar (derecha). */
export function ProgressBar({ progress, legend = false }: { progress: TopicProgress; legend?: boolean }) {
  const total = Math.max(1, progress.total);
  return (
    <div className="progress-block">
      <div
        className="bar"
        role="img"
        aria-label={SEGMENTS.map((s) => `${progress[s.key]} ${s.label.toLowerCase()}`).join(", ")}
      >
        {SEGMENTS.map((s) =>
          progress[s.key] > 0 ? (
            <i key={s.key} className={`seg-${s.key}`} style={{ width: `${(progress[s.key] / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      {legend && (
        <ul className="legend">
          {SEGMENTS.map((s) => (
            <li key={s.key}>
              <i className={`seg-${s.key}`} />
              {s.label} <strong>{progress[s.key]}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
