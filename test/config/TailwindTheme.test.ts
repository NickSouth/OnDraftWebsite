const config = require("../../tailwind.config.cjs");

describe("tailwind theme (v2.1 c1-foundation)", () => {
  it("uses Newsreader for display and Source Sans 3 for sans", () => {
    expect(config.theme.extend.fontFamily.display[0]).toBe("Newsreader");
    expect(config.theme.extend.fontFamily.sans[0]).toBe('"Source Sans 3"');
    expect(config.theme.extend.fontFamily.display).toContain("serif");
    expect(config.theme.extend.fontFamily.sans).toContain("sans-serif");
  });

  it("scales the radius theme ~1.5x (v2.1 QA: 1.2x was too subtle)", () => {
    expect(config.theme.extend.borderRadius).toEqual({
      sm: "0.1875rem",
      DEFAULT: "0.375rem",
      md: "0.5625rem",
      lg: "0.75rem",
      xl: "1.125rem",
      "2xl": "1.5rem",
      "3xl": "2.25rem",
    });
  });
});
