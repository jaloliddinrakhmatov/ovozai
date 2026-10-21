/**
 * Shared Prettier configuration for the OvozAI monorepo.
 * Referenced via the root package.json `"prettier": "@ovozai/config/prettier"`.
 * @type {import("prettier").Config}
 */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf",
  arrowParens: "always",
  bracketSpacing: true,
};
