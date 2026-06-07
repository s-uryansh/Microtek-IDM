import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "3e7e-2a09-bac5-3e0f-1a8c-00-2a5-101.ngrok-free.app"
    ]
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.js"
  }
});
