import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Requests to /api go to the Node backend (server/, default port 5000)
    proxy: { "/api": "http://localhost:5000" },
  },
});
