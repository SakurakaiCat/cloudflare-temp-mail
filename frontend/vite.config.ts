import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 构建产物输出到仓库根的 public/，供 Cloudflare Workers + Assets 直接托管。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5180,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
