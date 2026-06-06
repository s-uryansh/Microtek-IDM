import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.test.js"],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.vitest
      }
    }
  }
];
