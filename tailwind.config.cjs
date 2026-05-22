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
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["Segoe UI", "Inter", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
