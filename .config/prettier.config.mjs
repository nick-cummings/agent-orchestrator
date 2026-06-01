// Prettier owns all formatting (see docs/CODING_STANDARDS.md → Formatting).
// Referenced explicitly via --config so it can live outside the project root.
/** @type {import("prettier").Config} */
const config = {
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    printWidth: 80,
    tabWidth: 4,
    arrowParens: "always",
};

export default config;
