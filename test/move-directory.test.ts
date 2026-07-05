import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { moveDirectory, isDuplicateMoveArtifact } from "../src/shared/fs/move-directory";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("move-directory");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

describe("moveDirectory", () => {
  test("uses renameSync when available", () => {
    const source = path.join(testTmpDir, "source");
    const target = path.join(testTmpDir, "target");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "file.txt"), "content", "utf-8");

    moveDirectory(source, target);

    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(path.join(target, "file.txt"), "utf-8")).toBe("content");
  });

  test("falls back to copy-then-remove on EXDEV, copying before removing source", () => {
    const source = path.join(testTmpDir, "source");
    const target = path.join(testTmpDir, "target");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "file.txt"), "content", "utf-8");

    const calls: string[] = [];
    const originalCpSync = fs.cpSync.bind(fs);
    const originalRmSync = fs.rmSync.bind(fs);

    const renameSpy = spyOn(fs, "renameSync").mockImplementation(() => {
      const error = new Error("cross-device link") as NodeJS.ErrnoException;
      error.code = "EXDEV";
      throw error;
    });
    const cpSpy = spyOn(fs, "cpSync").mockImplementation((...args: Parameters<typeof fs.cpSync>) => {
      calls.push("cpSync");
      return originalCpSync(...args);
    });
    const rmSpy = spyOn(fs, "rmSync").mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
      calls.push("rmSync");
      return originalRmSync(...args);
    });

    try {
      moveDirectory(source, target);
    } finally {
      renameSpy.mockRestore();
      cpSpy.mockRestore();
      rmSpy.mockRestore();
    }

    expect(calls).toEqual(["cpSync", "rmSync"]);
  });
});

describe("isDuplicateMoveArtifact", () => {
  test("reports true only when both source and target exist", () => {
    const source = path.join(testTmpDir, "source");
    const target = path.join(testTmpDir, "target");
    fs.mkdirSync(source, { recursive: true });

    expect(isDuplicateMoveArtifact(source, target)).toBe(false);

    fs.mkdirSync(target, { recursive: true });
    expect(isDuplicateMoveArtifact(source, target)).toBe(true);
  });
});
