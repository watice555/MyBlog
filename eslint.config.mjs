import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The site intentionally uses hash routing (#home/#archive/#editor) inside
      // a single static page; window.location.assign("#...") is not a Next.js
      // page navigation.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // Override default ignores of eslint-config-next. The negation re-includes
  // build/: the local editor plugins it holds are the most security-sensitive
  // code in this repository and must not silently escape linting.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    ".local/**",
    "next-env.d.ts",
    "!build/**",
  ]),
]);

export default eslintConfig;
