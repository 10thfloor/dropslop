import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Arc'teryx inspired palette
        background: {
          DEFAULT: "#0a0a0a",
          secondary: "#141414",
          card: "#1a1a1a",
        },
        foreground: {
          DEFAULT: "#ffffff",
          secondary: "#888888",
          muted: "#555555",
        },
        accent: {
          DEFAULT: "#e85a1c",
          hover: "#ff6b2c",
        },
        success: "#22c55e",
        border: "#2a2a2a",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        pulse: "pulse 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "count-up": "countUp 0.3s ease-out",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
