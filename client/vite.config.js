import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts:[
      "5bf8-2a09-bac5-3ae8-1a96-00-2a6-29.ngrok-free.app",
    ],
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.js"
  }
});
