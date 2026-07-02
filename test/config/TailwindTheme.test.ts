const config = require("../../tailwind.config.cjs");

describe("tailwind theme (v2.1 c1-foundation)", () => {
  it("uses Newsreader for display and Source Sans 3 for sans", () => {
    expect(config.theme.extend.fontFamily.display[0]).toBe("Newsreader");
    expect(config.theme.extend.fontFamily.sans[0]).toBe('"Source Sans 3"');
    expect(config.theme.extend.fontFamily.display).toContain("serif");
    expect(config.theme.extend.fontFamily.sans).toContain("sans-serif");
  });

  it("scales the radius theme ~1.2x", () => {
    expect(config.theme.extend.borderRadius).toEqual({
      sm: "0.15rem",
      DEFAULT: "0.3rem",
      md: "0.45rem",
      lg: "0.6rem",
      xl: "0.9rem",
      "2xl": "1.2rem",
      "3xl": "1.8rem",
    });
  });
});
