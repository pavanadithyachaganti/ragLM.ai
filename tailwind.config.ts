import type { Config } from "tailwindcss";

// Colors resolve to CSS variables (RGB triplets) defined in globals.css, so the
// same class names work in both dark and light themes and support /alpha.
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: withAlpha("--ink"),
        panel: withAlpha("--panel"),
        panel2: withAlpha("--panel2"),
        line: withAlpha("--line"),
        line2: withAlpha("--line2"),
        fg: withAlpha("--fg"),
        muted: withAlpha("--muted"),
        faint: withAlpha("--faint"),
        ok: withAlpha("--ok"),
        warn: withAlpha("--warn"),
        bad: withAlpha("--bad"),
        accent: withAlpha("--accent"),
        accent2: withAlpha("--accent2"),
      },
      fontFamily: {
        mono: ["ui-monospace", "SF Mono", "JetBrains Mono", "Menlo", "monospace"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
