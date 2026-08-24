import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#FAF8F4",
        surface: "#FFFFFF",
        inverse: "#1B1B18",
        primary: "#1B1B18",
        secondary: "#726E66",
        tertiary: "#A39E93",
        onInverse: "#FAF8F4",
        accent: "#1F4D3D",
        accentSoft: "#E7EFEA",
        border: "#E7E3DA",
        borderStrong: "#1B1B18",
        danger: "#A6423A",
        dangerSoft: "#F4E5E2",
        warning: "#93692A",
        warningSoft: "#F2EADA",
      },
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans-thai)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        pill: "100px",
      },
    },
  },
  plugins: [],
};
export default config;
