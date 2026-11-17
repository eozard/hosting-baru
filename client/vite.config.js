import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Baca file .env dari root project (satu file env untuk server & client).
  // Hanya variabel berprefix VITE_ yang di-expose ke client.
  envDir: "..",
  server: {
    port: 5173,
    open: false,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
