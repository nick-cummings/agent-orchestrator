// ESLint flat config. Stays at the project root (resolver-pinned; editors and
// `next lint` expect it here) per docs/CODING_STANDARDS.md → Project layout.
//
// Tier: typescript-eslint strict + stylistic *type-checked*, plus the manual
// tightenings from the standards, with eslint-config-prettier loaded LAST so
// the formatter and linter never fight. The remaining tier-3 plugins (unicorn,
// perfectionist, security, sonarjs) are a tracked follow-up.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default defineConfig([
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "coverage/**",
        "playwright-report/**",
        "test-results/**",
        "next-env.d.ts",
    ]),
    ...nextVitals,
    ...nextTs,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            eqeqeq: ["error", "always"],
            // Functional style: contracts and props are `type` aliases, not interfaces.
            "@typescript-eslint/consistent-type-definitions": ["error", "type"],
            "max-lines": ["error", 500],
            "no-console": ["warn", { allow: ["warn", "error"] }],
            "no-implicit-coercion": "error",
            "no-nested-ternary": "error",
            "no-param-reassign": ["error", { props: true }],
            "prefer-template": "error",
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
    // Tests and config glue: relax product-only rules.
    {
        files: [
            "**/*.test.{ts,tsx}",
            "src/test-utils/**",
            "tests/**",
            "**/*.config.*",
        ],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "max-lines": "off",
        },
    },
    // Plain JS config files carry no type information — turn off type-checked rules.
    {
        files: ["**/*.{js,mjs,cjs}"],
        extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
]);
