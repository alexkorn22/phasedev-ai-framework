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
  test("false when target is absent", () => {
    const source = path.join(testTmpDir, "s");
    const target = path.join(testTmpDir, "t");
    fs.mkdirSync(source, { recursive: true });
    expect(isDuplicateMoveArtifact(source, target)).toBe(false);
  });

  test("true when both trees have identical contents", () => {
    const source = path.join(testTmpDir, "s");
    const target = path.join(testTmpDir, "t");
    fs.mkdirSync(path.join(source, "sub"), { recursive: true });
    fs.mkdirSync(path.join(target, "sub"), { recursive: true });
    fs.writeFileSync(path.join(source, "a.txt"), "hi", "utf-8");
    fs.writeFileSync(path.join(target, "a.txt"), "hi", "utf-8");
    fs.writeFileSync(path.join(source, "sub", "b.txt"), "x", "utf-8");
    fs.writeFileSync(path.join(target, "sub", "b.txt"), "x", "utf-8");
    expect(isDuplicateMoveArtifact(source, target)).toBe(true);
  });

  test("false when file contents diverge", () => {
    const source = path.join(testTmpDir, "s");
    const target = path.join(testTmpDir, "t");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(source, "a.txt"), "one", "utf-8");
    fs.writeFileSync(path.join(target, "a.txt"), "two", "utf-8");
    expect(isDuplicateMoveArtifact(source, target)).toBe(false);
  });

  test("false when the file set differs", () => {
    const source = path.join(testTmpDir, "s");
    const target = path.join(testTmpDir, "t");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(source, "a.txt"), "x", "utf-8");
    fs.writeFileSync(path.join(target, "a.txt"), "x", "utf-8");
    fs.writeFileSync(path.join(source, "extra.txt"), "y", "utf-8");
    expect(isDuplicateMoveArtifact(source, target)).toBe(false);
  });

  test("false when a tree contains a symlink entry, even if the target resolves identically", () => {
    const source = path.join(testTmpDir, "s");
    const target = path.join(testTmpDir, "t");
    const linkedFile = path.join(testTmpDir, "linked.txt");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(linkedFile, "hi", "utf-8");
    fs.symlinkSync(linkedFile, path.join(source, "a.txt"));
    fs.writeFileSync(path.join(target, "a.txt"), "hi", "utf-8");
    expect(isDuplicateMoveArtifact(source, target)).toBe(false);
  });
});
