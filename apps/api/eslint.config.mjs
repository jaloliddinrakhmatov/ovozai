import config from "@ovozai/config/eslint";

export default [
  ...config,
  {
    rules: {
      // NestJS resolves constructor dependencies from emitted decorator
      // metadata, which requires injected classes to be value imports.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
