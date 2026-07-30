import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  knownHarnesses,
  loadModelTiers,
  modelTiersPath,
  parseModelTiers,
  resolveModel
} from "../src/entities/model-tiers/model-tiers";

const VALID = `
claude-code: { cheap: haiku, standard: sonnet, strong: opus }
opencode:    { cheap: google/gemini-flash, standard: anthropic/claude-sonnet-5, strong: anthropic/claude-opus-5 }
`;

let tmpDir: string;
const originalEnv = process.env.PHASEDEV_MODELS_FILE;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-tiers-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalEnv === undefined) {
    delete process.env.PHASEDEV_MODELS_FILE;
  } else {
    process.env.PHASEDEV_MODELS_FILE = originalEnv;
  }
});

function writeModels(content: string): string {
  const filePath = path.join(tmpDir, "models.yaml");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("parseModelTiers", () => {
  test("parses harnesses and tiers", () => {
    expect(parseModelTiers(VALID)["claude-code"]).toEqual({
      cheap: "haiku",
      standard: "sonnet",
      strong: "opus"
    });
  });

  test("drops a non-object harness entry with a warning", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(parseModelTiers("claude-code: nope\n")).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("drops an unknown tier key and a non-string model with a warning", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseModelTiers("claude-code: { cheap: haiku, turbo: x, strong: 5 }\n");
    expect(parsed["claude-code"]).toEqual({ cheap: "haiku" });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("returns an empty map for empty content", () => {
    expect(parseModelTiers("")).toEqual({});
  });
});

describe("loadModelTiers", () => {
  test("loads from an explicit path", () => {
    const tiers = loadModelTiers(writeModels(VALID));
    expect(tiers.source).toBe("file");
    expect(knownHarnesses(tiers)).toEqual(["claude-code", "opencode"]);
  });

  test("honors PHASEDEV_MODELS_FILE when no path is given", () => {
    process.env.PHASEDEV_MODELS_FILE = writeModels(VALID);
    expect(loadModelTiers().source).toBe("file");
  });

  test("degrades to missing when the file does not exist", () => {
    const tiers = loadModelTiers(path.join(tmpDir, "absent.yaml"));
    expect(tiers).toEqual({ harnesses: {}, source: "missing" });
  });

  test("degrades to missing on malformed YAML instead of throwing", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const tiers = loadModelTiers(writeModels("claude-code: { cheap: [\n"));
    expect(tiers).toEqual({ harnesses: {}, source: "missing" });
    warn.mockRestore();
  });

  test("degrades to missing on an empty file", () => {
    expect(loadModelTiers(writeModels("   \n")).source).toBe("missing");
  });
});

describe("resolveModel", () => {
  test("resolves a known harness and tier", () => {
    const tiers = loadModelTiers(writeModels(VALID));
    expect(resolveModel(tiers, "claude-code", "strong")).toBe("opus");
  });

  test("returns undefined for an unknown harness", () => {
    const tiers = loadModelTiers(writeModels(VALID));
    expect(resolveModel(tiers, "cursor", "cheap")).toBeUndefined();
  });

  test("returns undefined for a tier the harness does not define", () => {
    const tiers = loadModelTiers(writeModels("claude-code: { cheap: haiku }\n"));
    expect(resolveModel(tiers, "claude-code", "strong")).toBeUndefined();
  });
});

describe("modelTiersPath", () => {
  test("prefers PHASEDEV_MODELS_FILE over the home default", () => {
    process.env.PHASEDEV_MODELS_FILE = "/custom/models.yaml";
    expect(modelTiersPath()).toBe("/custom/models.yaml");
  });

  test("defaults under the home config directory", () => {
    delete process.env.PHASEDEV_MODELS_FILE;
    expect(modelTiersPath()).toBe(path.join(os.homedir(), ".config", "phasedev", "models.yaml"));
  });
});
