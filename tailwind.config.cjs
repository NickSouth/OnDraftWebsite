/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/views/**/*.ejs",
    "./src/static/**/*.js",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        draft: {
          foam: "#fff7d6",
          gold: "#d99822",
          amber: "#a75f12",
          navy: "#07111f",
          slate: "#121c2b",
          ink: "#0b1220",
          line: "#263247",
        },
      },
      boxShadow: {
        editorial: "0 24px 70px rgba(7, 17, 31, 0.18)",
      },
      fontFamily: {
        display: ["Newsreader", "Georgia", "Cambria", '"Times New Roman"', "serif"],
        sans: ['"Source Sans 3"', '"Segoe UI"', "Inter", "Arial", "sans-serif"],
      },
      borderRadius: {
        sm: "0.1875rem",
        DEFAULT: "0.375rem",
        md: "0.5625rem",
        lg: "0.75rem",
        xl: "1.125rem",
        "2xl": "1.5rem",
        "3xl": "2.25rem",
      },
    },
  },
  plugins: [],
};
