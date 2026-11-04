/**
 * Migrador mínimo: aplica en orden los archivos .sql de /migrations que aún no se aplicaron
 * y los anota en la tabla schema_migrations. Cada archivo corre en su propia transacción.
 * Uso: npm run db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, withTransaction } from "./pool";

const here = path.dirname(fileURLToPath(import.meta.url));
// Funciona desde src/infrastructure/db (tsx) y desde dist (build).
const candidates = [path.resolve(here, "../../../migrations"), path.resolve(here, "../migrations")];

async function findMigrationsDir(): Promise<string> {
  for (const dir of candidates) {
    try {
      await readdir(dir);
      return dir;
    } catch {
      // probar el siguiente
    }
  }
  throw new Error("No se encontró la carpeta migrations");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el .env");
  const db = createPool(url);
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = await findMigrationsDir();
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await withTransaction(db, async (client) => {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      });
      console.log(`✔ Migración aplicada: ${file}`);
      count++;
    }
    console.log(count ? `Listo: ${count} migración(es) nueva(s).` : "La base de datos ya estaba al día.");
  } finally {
    await db.end();
  }
}

/**
 * Explica el error en palabras útiles. Cuando PostgreSQL no responde, Node lanza un AggregateError
 * (prueba ::1 y 127.0.0.1) cuyo mensaje está vacío: por eso hay que mirar dentro.
 */
function describeDbError(error: unknown): string {
  const inner = error instanceof AggregateError ? (error.errors[0] as unknown) : error;
  const code = (inner as { code?: string } | null)?.code;
  if (code === "ECONNREFUSED") {
    return "no hay ningún PostgreSQL escuchando en esa dirección. ¿Está arrancado Docker Desktop? Ejecuta `npm run db:up` y revisa el puerto de DATABASE_URL (5433).";
  }
  if (code === "28P01") return "usuario o contraseña incorrectos. Revisa DATABASE_URL en tu .env (debe ser aula:aula@localhost:5433).";
  if (code === "3D000") return "la base de datos no existe. Revisa el nombre al final de DATABASE_URL (aula_viva).";
  if (code === "ENOTFOUND") return "no se encuentra el servidor de DATABASE_URL. Revisa la dirección.";
  const message = inner instanceof Error ? inner.message : String(inner);
  return message || `error sin mensaje${code ? ` (código ${code})` : ""}`;
}

main().catch((error) => {
  console.error("✖ Error en la migración:", describeDbError(error));
  process.exit(1);
});
