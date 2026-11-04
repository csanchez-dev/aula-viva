import { buildContainer } from "./container";
import { loadConfig } from "./infrastructure/config";
import { createApp } from "./interfaces/http/app";

const config = loadConfig();
const { deps, db, background } = buildContainer(config);
const app = createApp(deps);

const server = app.listen(config.PORT, () => {
  console.log(`API de Aula Viva en http://localhost:${config.PORT} · IA: ${config.AI_PROVIDER}`);
});

// Cierre ordenado: deja de aceptar peticiones y cierra las conexiones a la base de datos.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} recibido: cerrando…`);
    server.close(() => {
      // Deja terminar las generaciones en curso antes de cerrar la base de datos.
      void background
        .drain()
        .then(() => db.end())
        .then(() => process.exit(0));
    });
  });
}
