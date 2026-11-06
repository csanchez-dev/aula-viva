import type { BetaActivityReport, BetaTesterActivity } from "@aula-viva/shared";
import { useEffect, useState } from "react";
import { api, errorText } from "../../api/client";

/** Lo que Charls necesita saber cada día: quién falta por activar la cuenta y a quién escribirle. */
function statusOf(t: BetaTesterActivity, goal: number): { text: string; className: string } {
  if (!t.registered) return { text: "Sin registrarse", className: "chip fading" };
  if (t.reviewedToday >= goal) return { text: "Cumplió hoy", className: "chip ok" };
  if (t.reviewedToday > 0) return { text: `Hoy ${t.reviewedToday}/${goal}`, className: "chip due" };
  return { text: "Hoy sin repasar", className: "chip fading" };
}

export function ActivityPage() {
  const [report, setReport] = useState<BetaActivityReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.betaActivity().then(setReport, (e) => setError(errorText(e)));
  }, []);

  if (error) return <p className="status err">{error}</p>;
  if (!report) return <div className="skeleton" aria-busy="true" />;

  const active = report.testers.filter((t) => t.reviewedToday >= report.goal).length;
  return (
    <section className="panel form-page">
      <div>
        <p className="eyebrow">Beta privada · {report.today} (Bogotá)</p>
        <h1>
          {active} de {report.testers.length} cumplieron hoy
        </h1>
        <p className="lead">Un día cuenta como cumplido con {report.goal} tarjetas repasadas.</p>
      </div>
      <div className="table-wrap">
        <table className="activity">
          <thead>
            <tr>
              <th>Betatester</th>
              <th>Hoy</th>
              <th>Días</th>
              <th>Racha</th>
              <th>Repasos</th>
              <th>Generaciones</th>
              <th>Último día</th>
            </tr>
          </thead>
          <tbody>
            {report.testers.map((t) => {
              const status = statusOf(t, report.goal);
              return (
                <tr key={t.email}>
                  <td>
                    <strong>{t.name ?? "—"}</strong>
                    <br />
                    <span className="hint">{t.email}</span>
                  </td>
                  <td>
                    <span className={status.className}>{status.text}</span>
                  </td>
                  <td>
                    {t.daysDone}/{report.totalDays}
                  </td>
                  <td>{t.streak}</td>
                  <td>{t.reviewsTotal}</td>
                  <td>{t.generations}</td>
                  <td>{t.lastActiveDay ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
