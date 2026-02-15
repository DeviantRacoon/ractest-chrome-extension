/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens from CSS variables (supports /opacity syntax)
        "bg-main": "rgb(var(--bg-main) / <alpha-value>)",
        "bg-card": "rgb(var(--bg-card) / <alpha-value>)",
        "bg-hover": "rgb(var(--bg-hover) / <alpha-value>)",
        "bg-secondary": "rgb(var(--bg-secondary) / <alpha-value>)",
        "accent-primary": "rgb(var(--accent-primary) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "accent-light": "rgb(var(--accent-light) / <alpha-value>)",
        "status-success": "rgb(var(--status-success) / <alpha-value>)",
        "status-error": "rgb(var(--status-error) / <alpha-value>)",
        "status-warning": "rgb(var(--status-warning) / <alpha-value>)",
        "status-info": "rgb(var(--status-info) / <alpha-value>)",
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "border-default": "rgb(var(--border-default) / <alpha-value>)",
        "border-focus": "rgb(var(--border-focus) / <alpha-value>)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(16, 185, 129, 0.1)",
        "glass-lg": "0 12px 48px 0 rgba(16, 185, 129, 0.15)",
      },
      backdropBlur: {
        glass: "12px",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
