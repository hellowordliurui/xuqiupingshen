import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        zhihu: {
          blue: "#0084ff",
          "blue-hover": "#0077e6",
          "blue-line": "rgba(0, 132, 255, 0.25)",
        },
        geek: {
          gray: "#595959",
          "gray-light": "#8c8c8c",
          "gray-bg": "#f5f5f5",
        },
        goal: {
          purple: "#8b7cb3",
        },
      },
      borderColor: {
        "zhihu-thin": "rgba(0, 132, 255, 0.35)",
      },
      backdropBlur: {
        xs: "2px",
      },
      backgroundImage: {
        "glass-white": "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
