import { describe, it, expect } from "bun:test";
import { parseConfig } from "../src/entities/config/config";

describe("config protectedPaths and maxOpenNits", () => {
  it("uses defaults when keys are absent", () => {
    const config = parseConfig("roles: {}\n");
    expect(config.protectedPaths).toEqual([]);
    expect(config.maxOpenNits).toBe(5);
  });

  it("parses valid protectedPaths and maxOpenNits", () => {
    const yaml = [
      "roles: {}",
      "maxOpenNits: 3",
      "protectedPaths:",
      "  - '**/migrations/**'",
      "  - '.github/**'"
    ].join("\n");
    const config = parseConfig(yaml);
    expect(config.maxOpenNits).toBe(3);
    expect(config.protectedPaths).toEqual(["**/migrations/**", ".github/**"]);
  });

  it("throws when protectedPaths is not an array of strings", () => {
    expect(() => parseConfig("roles: {}\nprotectedPaths: 'not-an-array'\n")).toThrow(
      "Config key protectedPaths must be an array of strings."
    );
    expect(() => parseConfig("roles: {}\nprotectedPaths:\n  - 123\n")).toThrow(
      "Config key protectedPaths must be an array of strings."
    );
  });

  it("throws when maxOpenNits is not a number", () => {
    expect(() => parseConfig("roles: {}\nmaxOpenNits: 'five'\n")).toThrow(
      "Config key maxOpenNits must be a number."
    );
  });
});
