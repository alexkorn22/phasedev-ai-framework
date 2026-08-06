import { describe, test, expect } from "bun:test";
import { parseConfig } from "../src/entities/config/config";

describe("parseConfig on malformed YAML", () => {
  test("throws on syntactically broken YAML", () => {
    expect(() => parseConfig("foo: [1, 2\nbar: }")).toThrow();
  });

  test("falls back to defaults on empty content", () => {
    const cfg = parseConfig("");
    expect(cfg.roles).toEqual([]);
  });

  test("rejects a multi-line role comment", () => {
    expect(() =>
      parseConfig("roles:\n  research: { tier: cheap, comment: \"line one\\nline two\" }\n")
    ).toThrow(/comment/);
  });
});
