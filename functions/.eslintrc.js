module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/src/**/*", // Ignore TypeScript source files
  ],
  rules: {
    "quotes": ["error", "double"],
    "indent": ["error", 2],
    "no-undef": "off",
    "no-unused-vars": "off",
  },
};