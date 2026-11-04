import { LoginSchema, RegisterSchema } from "@aula-viva/shared";
import { type FormEvent, useState } from "react";
import { api, ApiError } from "../../api/client";

export function AuthScreen({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    // Misma validación que el servidor, gracias al paquete compartido.
    const parsed =
      mode === "register" ? RegisterSchema.safeParse({ name, email, password }) : LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await api.register(RegisterSchema.parse({ name, email, password }));
      else await api.login(LoginSchema.parse({ email, password }));
      await onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-hero">
        <h1>
          Aula <span>Viva</span>
        </h1>
        <p>Sube tus apuntes y deja de olvidar lo que estudias. La IA los convierte en flashcards y preguntas tipo examen, y cada día te pide repasar justo lo que estás a punto de olvidar.</p>
        <ul className="auth-points">
          <li>Tarjetas basadas solo en tus apuntes, con el fragmento de donde salen</li>
          <li>Repaso espaciado: unos minutos al día bastan</li>
          <li>Simulacros con la explicación de cada respuesta</li>
        </ul>
      </section>

      <form className="panel auth-card" onSubmit={submit} noValidate>
        <div className="tabs" role="group" aria-label="Acceso">
          <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>
            Crear cuenta
          </button>
          <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
            Entrar
          </button>
        </div>

        {mode === "register" && (
          <>
            <label htmlFor="name">Nombre</label>
            <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && <p className="hint">Mínimo 10 caracteres, con letras y números.</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Un momento…" : mode === "register" ? "Empezar gratis" : "Entrar"}
        </button>
        <p className="status err" role="alert">
          {error}
        </p>
      </form>
    </main>
  );
}
