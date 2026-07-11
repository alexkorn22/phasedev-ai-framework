import { describe, test, expect } from "bun:test";
import * as path from "path";
import { parseStringOption, FlagValueError } from "../src/shared/cli/parse-string-option";
import { parseProjectPath, parseConfigPath } from "../src/shared/cli/parse-project-path";

describe("parseStringOption", () => {
  test("returns the first occurrence", () => {
    expect(parseStringOption(["--x", "a", "--x", "b"], "--x")).toBe("a");
  });
  test("throws FlagValueError when the value looks like a flag", () => {
    expect(() => parseStringOption(["--x", "--y"], "--x")).toThrow(FlagValueError);
  });
  test("returns undefined when absent or trailing", () => {
    expect(parseStringOption(["--x"], "--x")).toBeUndefined();
    expect(parseStringOption([], "--x")).toBeUndefined();
  });
});

describe("parseProjectPath", () => {
  test("resolves the first --project-path occurrence", () => {
    expect(parseProjectPath(["--project-path", "/a", "--project-path", "/b"])).toBe(path.resolve("/a"));
  });
  test("supports the -p alias", () => {
    expect(parseProjectPath(["-p", "/a"])).toBe(path.resolve("/a"));
  });
  test("defaults to cwd when unset", () => {
    expect(parseProjectPath([])).toBe(path.resolve(process.cwd()));
  });
  test("throws FlagValueError on a flag-like value", () => {
    expect(() => parseProjectPath(["--project-path", "--change"])).toThrow(FlagValueError);
  });
});

describe("parseConfigPath", () => {
  test("resolves the first --config occurrence", () => {
    expect(parseConfigPath(["--config", "/c", "--config", "/d"])).toBe(path.resolve("/c"));
  });
  test("returns undefined when unset", () => {
    expect(parseConfigPath([])).toBeUndefined();
  });
  test("throws FlagValueError on a flag-like value", () => {
    expect(() => parseConfigPath(["--config", "--change"])).toThrow(FlagValueError);
  });
});
