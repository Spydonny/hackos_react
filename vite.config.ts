import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [react(), cesium()],

  optimizeDeps: {
    include: ["cesium", "mersenne-twister"],
  },

  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
