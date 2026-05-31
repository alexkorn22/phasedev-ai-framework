import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("README", () => {
  test("documents the Russian flow usage surface", () => {
    const readme = fs.readFileSync(path.resolve(__dirname, "..", "README.md"), "utf-8");

    expect(readme).toContain("Agentic Engineering Flow");
    expect(readme).toContain("Ручной режим");
    expect(readme).toContain("Ralph-раннер");
    expect(readme).toContain("один этап равен одной новой сессии Codex");
    expect(readme).toContain("config.yaml");
    expect(readme).toContain("streamAgentOutput");
    expect(readme).toContain("openspec/flow-ralph");
    expect(readme).toContain("npm install");
    expect(readme).toContain("Проверки с участием человека");
    expect(readme).toContain("Решение проблем");
    expect(readme).toContain("bun run src/flow-cli.ts init --project-path");
    expect(readme).toContain("npm run flow:ralph -- --project-path");
  });
});
