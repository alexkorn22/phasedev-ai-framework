import { describe, test, expect } from "bun:test";
import { parseConfigGetKey } from "../src/features/config-ops/parse-config-get-key";

describe("parseConfigGetKey", () => {
  test("returns the first positional key", () => {
    expect(parseConfigGetKey(["config", "maxIterations"])).toBe("maxIterations");
  });

  test("skips --project-path and its value", () => {
    expect(parseConfigGetKey(["config", "--project-path", "/tmp/p", "maxIterations"])).toBe("maxIterations");
  });

  test("skips -p and its value", () => {
    expect(parseConfigGetKey(["config", "-p", "/tmp/p", "maxIterations"])).toBe("maxIterations");
  });

  test("skips --config and its value", () => {
    expect(parseConfigGetKey(["config", "--config", "/tmp/c.yaml", "maxIterations"])).toBe("maxIterations");
  });

  test("skips the `set` subcommand token", () => {
    expect(parseConfigGetKey(["config", "set", "maxIterations"])).toBe("maxIterations");
  });

  test("skips standalone flags such as --json", () => {
    expect(parseConfigGetKey(["config", "--json", "maxIterations"])).toBe("maxIterations");
  });

  test("returns \"\" when only flags are present", () => {
    expect(parseConfigGetKey(["config", "--json"])).toBe("");
  });
});
