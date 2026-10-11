import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Las reglas son funciones puras: los tests corren sin base de datos ni red.
    reporters: "verbose",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
