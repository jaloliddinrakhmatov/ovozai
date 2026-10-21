import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import base from "./index.js";

/**
 * Flat ESLint config for React / Next.js packages.
 * Adds browser globals and the React Hooks rules on top of the base config.
 */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
