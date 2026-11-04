import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En desarrollo, /api se redirige a la API (puerto 3000): mismo origen, así la cookie de sesión funciona sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
