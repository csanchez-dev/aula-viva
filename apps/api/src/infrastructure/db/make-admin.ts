/**
 * Convierte en administrador a un usuario ya registrado.
 * Uso: npm run make-admin -w @aula-viva/api -- tu@correo.com
 */
import { createPool } from "./pool";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Indica el correo: npm run make-admin -w @aula-viva/api -- tu@correo.com");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el .env");
  const db = createPool(url);
  try {
    const result = await db.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
    console.log(result.rowCount ? `✔ ${email} ahora es administrador.` : `✖ No existe ningún usuario con el correo ${email}.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("✖", error instanceof Error ? error.message : error);
  process.exit(1);
});
