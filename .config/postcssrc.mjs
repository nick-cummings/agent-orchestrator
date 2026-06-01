// PostCSS config. Lives in .config/ under the `postcssrc` name because that's
// the filename postcss-load-config searches for in .config/ — which is what
// Next's Turbopack uses to resolve it. (`.config/postcss.config.*` is NOT
// found; `.config/postcssrc.*` is.)
/** @type {import("postcss-load-config").Config} */
const config = {
    plugins: { "@tailwindcss/postcss": {} },
};

export default config;
