import { describe, test, expect } from "bun:test";
import { shellQuote } from "../src/shared/shell/shell-quote";

describe("shellQuote", () => {
  test("wraps plain values in double quotes", () => {
    expect(shellQuote("my-change")).toBe('"my-change"');
  });
  test("escapes double quotes, backslashes, dollar signs and backticks", () => {
    expect(shellQuote('a"b')).toBe('"a\\"b"');
    expect(shellQuote("a\\b")).toBe('"a\\\\b"');
    expect(shellQuote("a$b`c")).toBe('"a\\$b\\`c"');
  });
});
