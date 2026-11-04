/**
 * Genera dist/_redirects para Netlify después de `vite build`.
 *
 * 1. /api/*  → proxy a la API de Render. Para el navegador todo es el mismo dominio,
 *    así la cookie de sesión es "first-party" (funciona también en Safari) y no hace falta CORS.
 * 2. /*      → index.html, para que recargar cualquier ruta de la SPA no dé 404.
 *
 * La URL de la API sale de la variable API_ORIGIN, así no queda escrita en el código.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const origin = process.env.API_ORIGIN?.trim().replace(/\/+$/, "");
const onNetlify = process.env.NETLIFY === "true";

if (!origin) {
  if (onNetlify) {
    console.error("✖ Falta la variable API_ORIGIN en Netlify (por ejemplo https://aula-viva-api.onrender.com).");
    process.exit(1);
  }
  console.log("ℹ API_ORIGIN no definida: no se genera _redirects (build local).");
  process.exit(0);
}

if (!/^https:\/\/[^/\s]+$/.test(origin)) {
  console.error(`✖ API_ORIGIN debe ser solo el origen con https, sin ruta. Recibido: "${origin}"`);
  process.exit(1);
}

const rules = [
  // 200! = reescritura (proxy) forzada: Netlify pide la respuesta a Render y la devuelve tal cual.
  `/api/*  ${origin}/api/:splat  200!`,
  `/*      /index.html             200`,
];
writeFileSync(path.join(dist, "_redirects"), `${rules.join("\n")}\n`);
console.log(`✔ _redirects generado: /api/* → ${origin}/api/*`);
