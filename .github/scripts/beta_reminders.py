"""Recordatorios diarios de la beta privada de Aula Viva.

Lee el informe de actividad de la API (con un token de solo lectura) y envía a cada
betatester un correo personalizado desde Gmail. Este repositorio es público: el
script nunca imprime correos ni nombres, solo recuentos.

Variables de entorno: API_URL, BETA_REPORT_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD,
DRY_RUN ("true" envía solo una vista previa a GMAIL_USER).
"""

import json
import os
import smtplib
import sys
import time
import urllib.error
import urllib.request
from email.message import EmailMessage

APP_URL = "https://aula-viva.netlify.app/#/"
SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdgFwdwsvBOYqno2XcBc_ssU3lc-gHR63PIX7uia6dikS11UA/viewform"


def fetch_report(api_url: str, token: str) -> dict:
    """El servicio gratuito de Render se duerme: reintenta hasta unos 4 minutos."""
    last_error = None
    for _ in range(16):
        try:
            req = urllib.request.Request(f"{api_url}/internal/beta-report", headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                sys.exit("La API rechazó el token (404). Revisa BETA_REPORT_TOKEN en Render y en GitHub.")
            last_error = f"HTTP {err.code}"
        except Exception as err:  # noqa: BLE001 - cualquier fallo de red se reintenta
            last_error = type(err).__name__
        time.sleep(15)
    sys.exit(f"No se pudo leer el informe: {last_error}")


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def compose(t: dict, today: str, goal: int) -> tuple[str, str, str]:
    """Devuelve (tipo, asunto, cuerpo) según lo que hizo hoy la persona."""
    days = [d["date"] for d in t["days"]]
    total = len(days)
    left_days = sum(1 for d in days if d > today)
    first = (t.get("name") or "").split(" ")[0]
    hello = f"Hola, {first}:" if first else "Hola:"
    missing = max(0, goal - t["reviewedToday"])

    if today == days[-1]:
        if t["registered"]:
            extra = f" Aún puedes repasar hoy: {APP_URL}" if missing else ""
            body = (
                f"{hello}\n\nHoy termina la beta. Cumpliste {t['daysDone']} de {total} días del reto. "
                f"¡Gracias por probar Aula Viva!{extra}\n\n"
                f"Tu opinión decide cómo sigue la app. ¿Me regalas 5 minutos para esta encuesta?\n{SURVEY_URL}\n\nCharls"
            )
        else:
            body = (
                f"{hello}\n\nHoy termina la beta de Aula Viva. Aunque no alcanzaste a probarla, tu opinión también me sirve. "
                f"¿Me regalas 5 minutos para esta encuesta?\n{SURVEY_URL}\n\nCharls"
            )
        return "encuesta", "Aula Viva: último día y tu opinión", body

    if not t["registered"]:
        body = (
            f"{hello}\n\nTodavía no has activado tu acceso a la beta de Aula Viva. Te toma un minuto: entra en {APP_URL}, "
            f'toca "Activar acceso" y usa el código que te llegó en el correo de invitación.\n\n'
            f"Quedan {plural(left_days, 'día', 'días')} de reto después de hoy, así que estás a tiempo de sumarte.\n\nCharls"
        )
        return "sin registrarse", "Aula Viva: tu acceso te está esperando", body

    if missing == 0:
        body = (
            f"{hello}\n\n¡Cumpliste el reto de hoy! Llevas {plural(t['streak'], 'día seguido', 'días seguidos')}. "
            f"Mañana vuelve a {APP_URL}: ahí es cuando el repaso espaciado hace su trabajo.\n\nCharls"
        )
        return "cumplió", "Aula Viva: reto de hoy cumplido", body

    streak = (
        f"Llevas {plural(t['streak'], 'día seguido', 'días seguidos')}, no rompas la racha."
        if t["streak"] > 0
        else "Es buen momento para empezar tu racha."
    )
    body = (
        f"{hello}\n\nHoy te {'falta' if missing == 1 else 'faltan'} {plural(missing, 'tarjeta', 'tarjetas')} "
        f"para cumplir el reto. {streak} Son unos 2 minutos: {APP_URL}\n\nCharls"
    )
    return "pendiente", f"Aula Viva: te {'falta' if missing == 1 else 'faltan'} {plural(missing, 'tarjeta', 'tarjetas')} hoy", body


def main() -> None:
    env = os.environ
    report = fetch_report(env["API_URL"].rstrip("/"), env["BETA_REPORT_TOKEN"].strip())
    print(f"Informe leído: {len(report['testers'])} betatesters.")
    today, goal, testers = report["today"], report["goal"], report["testers"]
    if not testers:
        sys.exit("El informe no trae betatesters: revisa BETA_INVITES en Render.")
    dates = [d["date"] for d in testers[0]["days"]]
    if not dates[0] <= today <= dates[-1]:
        print(f"Hoy ({today}) está fuera del reto: no se envía nada.")
        return

    # Al pegar secretos suelen colarse espacios o saltos de línea, que rompen el inicio de sesión SMTP.
    sender = env["GMAIL_USER"].strip()
    password = "".join(env["GMAIL_APP_PASSWORD"].split())
    dry = env.get("DRY_RUN", "true") == "true"
    if "@" not in sender or len(password) != 16:
        sys.exit(f"Revisa los secretos: GMAIL_USER debe ser un correo y GMAIL_APP_PASSWORD 16 letras (tiene {len(password)}).")
    messages = []
    for t in testers:
        kind, subject, body = compose(t, today, goal)
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = f"Charls de Aula Viva <{sender}>", t["email"], subject
        msg.set_content(body)
        messages.append((kind, t["email"], msg))

    counts: dict[str, int] = {}
    for kind, _, _ in messages:
        counts[kind] = counts.get(kind, 0) + 1
    failed = []
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        try:
            smtp.login(sender, password)
        except smtplib.SMTPException as err:
            sys.exit(f"Gmail rechazó el inicio de sesión ({type(err).__name__}). Revisa GMAIL_USER y la contraseña de aplicación.")
        if not dry:
            for kind, email, msg in messages:
                try:
                    smtp.send_message(msg)
                except Exception as err:  # noqa: BLE001
                    failed.append(f"{email}: {type(err).__name__}")
        lines = [f"- {email}: {kind}" for kind, email, _ in messages]
        summary = EmailMessage()
        summary["From"] = summary["To"] = sender
        summary["Subject"] = f"{'[PRUEBA, no enviado] ' if dry else ''}Recordatorios Aula Viva del {today}"
        preview = "\n\n".join(f"--- Para {e} · {m['Subject']}\n{m.get_content()}" for _, e, m in messages)
        summary.set_content(
            ("Modo prueba: no se envió nada a los betatesters.\n\n" if dry else "")
            + "\n".join(lines)
            + (f"\n\nFallaron:\n" + "\n".join(failed) if failed else "")
            + f"\n\nMensajes:\n\n{preview}"
        )
        smtp.send_message(summary)

    print(f"{'Prueba' if dry else 'Envío'} del {today}: " + ", ".join(f"{k}: {v}" for k, v in counts.items()))
    if failed:
        sys.exit(f"Fallaron {len(failed)} envíos (detalle en el correo de resumen).")


if __name__ == "__main__":
    main()
