import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Next 16 ships its ESLint config as native flat config, so there is
 * no FlatCompat shim. `npm run lint` runs this.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /*
       * These three come from the React Compiler rule set. The site
       * doesn't run the compiler, and every spot they flag is
       * deliberate: "latest value" refs that feed the 3D render
       * loops without rebuilding them, and client-only state read
       * from localStorage after mount (it can't be read during the
       * server render). Rewriting those would risk the Lab for no
       * gain. Revisit if the compiler is ever switched on.
       */
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Third-party mini-games served as static files in the Lab's arcade.
  globalIgnores([".next/**", "node_modules/**", "out/**", "public/**", "next-env.d.ts"]),
]);

export default eslintConfig;
