import type { MeResponse } from "@aula-viva/shared";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, waitForApi } from "../api/client";
import { AuthScreen } from "../features/auth/AuthScreen";
import { ActivityPage } from "../features/home/ActivityPage";
import { HomePage } from "../features/home/HomePage";
import { QuizPage } from "../features/review/QuizPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { NewTopicPage } from "../features/topics/NewTopicPage";
import { TopicPage } from "../features/topics/TopicPage";
import { href, useRoute } from "../lib/router";

type SessionState =
  | { status: "loading"; waitedSeconds: number }
  | { status: "offline" }
  | { status: "guest" }
  | { status: "ready"; me: MeResponse };

export function App() {
  const [session, setSession] = useState<SessionState>({ status: "loading", waitedSeconds: 0 });
  const route = useRoute();

  const refresh = useCallback(async () => {
    try {
      setSession({ status: "ready", me: await api.me() });
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") setSession({ status: "guest" });
      else setSession({ status: "offline" });
    }
  }, []);

  const boot = useCallback(async () => {
    setSession({ status: "loading", waitedSeconds: 0 });
    const awake = await waitForApi((waitedSeconds) => setSession({ status: "loading", waitedSeconds }));
    if (awake) await refresh();
    else setSession({ status: "offline" });
  }, [refresh]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setSession({ status: "guest" });
    window.location.hash = "#/";
  };

  if (session.status === "loading") {
    return (
      <div className="center-screen" aria-busy="true">
        <div className="center">
          <div className="thinking" aria-label="Cargando">
            <i /> <i /> <i />
          </div>
          {session.waitedSeconds > 0 && (
            <p className="hint">Despertando el servidor… puede tardar hasta un minuto ({session.waitedSeconds} s)</p>
          )}
        </div>
      </div>
    );
  }
  if (session.status === "offline") {
    return (
      <div className="center-screen">
        <div className="center">
          <h2>No podemos conectar con el servidor</h2>
          <p className="hint">Comprueba tu conexión o inténtalo en unos minutos.</p>
          <button className="primary" onClick={() => void boot()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (session.status === "guest") return <AuthScreen onSignedIn={refresh} />;

  const { user, usage, beta } = session.me;
  const left = Math.max(0, usage.limit - usage.used);
  const focus = route.name === "review" || route.name === "quiz";

  return (
    <div className={`page${focus ? " focus" : ""}`}>
      <header className="top">
        <a className="brand" href={href({ name: "home" })}>
          Aula <span>Viva</span>
        </a>
        <nav className="nav" aria-label="Principal">
          <a href={href({ name: "home" })} aria-current={route.name === "home" ? "page" : undefined}>
            Hoy
          </a>
          <a href={href({ name: "new" })} aria-current={route.name === "new" ? "page" : undefined}>
            Nuevo tema
          </a>
          {beta.admin && (
            <a href={href({ name: "activity" })} aria-current={route.name === "activity" ? "page" : undefined}>
              Actividad
            </a>
          )}
        </nav>
        <div className="top-actions">
          {(beta.tester || beta.admin) && (
            <span className="beta-pill small">
              <i aria-hidden="true" /> Beta
            </span>
          )}
          <span
            className={`badge${left === 0 ? " warn" : ""}`}
            title={`Generaciones con IA. Se reinician ${new Date(usage.resetsAt).toLocaleString("es")}`}
          >
            {user.plan === "pro" ? "Pro" : "Gratis"} · {left}/{usage.limit} generaciones
          </span>
          <button className="ghost small" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </header>

      <main>
        {route.name === "home" && <HomePage name={user.name} />}
        {route.name === "new" && <NewTopicPage onUsage={refresh} />}
        {route.name === "topic" && <TopicPage key={route.id} id={route.id} onUsage={refresh} />}
        {route.name === "review" && <ReviewPage key={route.topicId ?? "all"} topicId={route.topicId} />}
        {route.name === "quiz" && <QuizPage key={route.id} id={route.id} />}
        {route.name === "activity" && <ActivityPage />}
      </main>

      <footer>Las tarjetas las genera una IA a partir de tus apuntes y pueden contener errores. Revísalas antes de estudiar.</footer>
    </div>
  );
}
