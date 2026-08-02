import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    server: {
      port: Number(env.VITE_PORT) || 5174,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@":       path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "../backend/utils"),
      },
    },
  };
});
