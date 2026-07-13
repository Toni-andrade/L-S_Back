import type { Config } from "tailwindcss";
import { BRAND } from "../../packages/domain/src/brand";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        oxford: BRAND.oxford,
        royal: BRAND.royal,
        celeste: BRAND.celeste,
        marrom: BRAND.marrom,
        verde: BRAND.verde,
        alert: BRAND.red,
        "alert-alt": BRAND.redAlt,
        "app-bg": BRAND.appBg,
        hairline: BRAND.border,
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(19, 33, 60, 0.05), 0 1px 3px rgba(19, 33, 60, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
