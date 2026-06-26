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
        /* ── Pilates Room brand palette (escala oficial) ── */
        brand: {
          50:  "#BEA98F",
          100: "#AA9376",
          200: "#988166",
          300: "#8F7559",
          400: "#725D51",
          500: "#665346",
          600: "#5F4B3D",
          700: "#544331",
          cream: "#F5ECDB",
        },
        /* alias compat: tokens viejos siguen apuntando a la nueva paleta */
        punto: {
          cream: "#F5ECDB",
          green: "#BEA98F",
          taupe: "#725D51",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        /* ── Brand fonts ── */
        gulfs:     ['"Gulfs"', '"Bebas Neue"', 'sans-serif'],
        alilato:   ['"Alilato"', '"Inter Tight"', '"Inter"', 'sans-serif'],
        editorial: ['"Fraunces"', '"Georgia"', 'serif'],
        /* ── Aliases ── */
        bebas: ['"Gulfs"', '"Bebas Neue"', 'sans-serif'],
        syne:  ['"Alilato"', '"Inter Tight"', 'sans-serif'],
        dm:    ['"Alilato"', '"Inter Tight"', 'sans-serif'],
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
