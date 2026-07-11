import { describe, it, expect } from "bun:test";
import { getExpressPrompt } from "../src/features/express-mode/get-express-prompt";

describe("express contract", () => {
  it("prints the express orchestration contract", () => {
    const { prompt } = getExpressPrompt();
    expect(prompt).toContain("PhaseDev Express");
    expect(prompt).toContain("plan confirmation");
    expect(prompt).toContain("phasedev create-change --quick");
  });

  it("has no skill-policy block (express is orchestration, not phase work)", () => {
    expect(getExpressPrompt().prompt).not.toContain("Configured Skill Policy");
    expect(getExpressPrompt().prompt).not.toContain("Flow Skill Boundary Protocol");
  });
});
