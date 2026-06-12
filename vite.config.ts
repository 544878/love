import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["app-icon.svg"],
      workbox: {
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024
      },
      manifest: {
        name: "LoveLog",
        short_name: "LoveLog",
        description: "LoveLog relationship and growth journal",
        theme_color: "#d9828d",
        background_color: "#fffaf6",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  test: {
    environment: "node"
  }
});
