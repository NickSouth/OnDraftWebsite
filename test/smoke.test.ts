import fs from "node:fs";
import { Err, Ok } from '../src/lib/result'

describe('result helpers', () => {
  it('creates Ok results', () => {
    const result = Ok('value')
    expect(result).toEqual({ ok: true, value: 'value' })
  })

  it('creates Err results', () => {
    const result = Err('error')
    expect(result).toEqual({ ok: false, value: 'error' })
  })

  it("loads the article share script with the Web Share API", () => {
    const script = fs.readFileSync("src/static/articleShare.js", "utf8");
    expect(script).toContain("navigator.share");
  })
})
