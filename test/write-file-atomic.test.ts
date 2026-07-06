import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "../src/shared/fs/write-file-atomic";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("write-file-atomic");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

describe("writeFileAtomic", () => {
  test("writes content with utf8 encoding", () => {
    const target = path.join(testTmpDir, "state.json");

    writeFileAtomic(target, "hello\n");

    expect(fs.readFileSync(target, "utf-8")).toBe("hello\n");
  });

  test("leaves no .tmp file behind", () => {
    const target = path.join(testTmpDir, "state.json");

    writeFileAtomic(target, "content");

    expect(fs.existsSync(`${target}.tmp.${process.pid}`)).toBe(false);
    expect(fs.readdirSync(testTmpDir)).toEqual(["state.json"]);
  });

  test("overwrites an existing file", () => {
    const target = path.join(testTmpDir, "state.json");
    fs.writeFileSync(target, "old", "utf-8");

    writeFileAtomic(target, "new");

    expect(fs.readFileSync(target, "utf-8")).toBe("new");
  });
});
