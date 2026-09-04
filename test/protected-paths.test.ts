import { describe, it, expect } from "bun:test";
import { pathMatchesSurface } from "../src/features/phase-control/changed-file-inventory";

describe("protectedPaths pattern matching", () => {
  const patterns = ["**/migrations/**", "**/generated/**", ".github/**", "config/*.secret.json"];

  it("matches files inside nested migrations directory", () => {
    expect(pathMatchesSurface("src/migrations/001.sql", patterns)).toBe(true);
    expect(pathMatchesSurface("database/migrations/v2/init.ts", patterns)).toBe(true);
  });

  it("matches files inside generated directory", () => {
    expect(pathMatchesSurface("src/generated/types.ts", patterns)).toBe(true);
  });

  it("matches files inside .github directory", () => {
    expect(pathMatchesSurface(".github/workflows/ci.yml", patterns)).toBe(true);
  });

  it("matches wildcard filename patterns", () => {
    expect(pathMatchesSurface("config/prod.secret.json", patterns)).toBe(true);
    expect(pathMatchesSurface("config/public.json", patterns)).toBe(false);
  });

  it("does not match regular application files", () => {
    expect(pathMatchesSurface("src/services/user.service.ts", patterns)).toBe(false);
    expect(pathMatchesSurface("test/unit.test.ts", patterns)).toBe(false);
    expect(pathMatchesSurface("README.md", patterns)).toBe(false);
  });
});
