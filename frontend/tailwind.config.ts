import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* ── VARRE24 brand palette (estética real: espresso · oat · cream) ── */
        brand: {
          50:  "#F6F2EB",
          100: "#E8DED4",
          200: "#D5C4B8",
          300: "#B5A091",
          400: "#5B4A3E",
          500: "#4A3D32",
          600: "#3A2F26",
          700: "#2A211B",
          cream: "#E8DED4",
        },
        /* alias compat: tokens viejos siguen apuntando a la nueva paleta */
        punto: {
          cream: "#E8DED4",
          green: "#B5A593",
          taupe: "#5B4A3E",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        /* ── Brand fonts: Anton (display/títulos) · Fraunces (editorial) · Inter Tight (cuerpo) ── */
        gulfs:     ['"Anton"', '"Arial Narrow"', '"Inter Tight"', 'sans-serif'],
        alilato:   ['"Inter Tight"', '"Inter"', 'sans-serif'],
        editorial: ['"Fraunces"', '"Georgia"', 'serif'],
        /* ── Aliases (display viejo → Anton; body viejo → Inter Tight) ── */
        bebas: ['"Anton"', '"Arial Narrow"', '"Inter Tight"', 'sans-serif'],
        syne:  ['"Inter Tight"', 'sans-serif'],
        dm:    ['"Inter Tight"', 'sans-serif'],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter:  "-0.025em",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        warm: "var(--shadow-warm)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
