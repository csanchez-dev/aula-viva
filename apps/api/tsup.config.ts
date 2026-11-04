import { defineConfig } from "tsup";

// Empaqueta la API en dist/main.js incluyendo los paquetes internos del monorepo.
export default defineConfig({
  entry: {
    main: "src/main.ts",
    migrate: "src/infrastructure/db/migrate.ts",
    "make-admin": "src/infrastructure/db/make-admin.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@aula-viva\//],
});
