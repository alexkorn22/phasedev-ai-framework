import * as fs from "fs";
import * as path from "path";

interface EvalCheck {
  type: string;
  target: string;
  expected: string;
}

interface EvalScenario {
  name: string;
  description: string;
  skill?: string;
  checks: EvalCheck[];
}

function runEvals(): boolean {
  const root = path.resolve(__dirname, "..");
  const scenariosDir = path.join(__dirname, "scenarios");

  if (!fs.existsSync(scenariosDir)) {
    console.error(`[EVALS] Scenarios directory not found: ${scenariosDir}`);
    return false;
  }

  const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith(".json"));
  console.log(`[EVALS] Found ${files.length} scenario(s) to evaluate.`);

  let allPassed = true;

  for (const file of files) {
    const filePath = path.join(scenariosDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const scenario = JSON.parse(content) as EvalScenario;

    console.log(`\n▶ Running Scenario: ${scenario.name}`);
    console.log(`  Description: ${scenario.description}`);

    let scenarioPassed = true;

    for (const check of scenario.checks) {
      if (check.type === "contains-text") {
        const targetPath = path.join(root, check.target);
        if (!fs.existsSync(targetPath)) {
          console.error(`  ✖ Target file missing: ${check.target}`);
          scenarioPassed = false;
          continue;
        }

        const targetContent = fs.readFileSync(targetPath, "utf-8");
        if (!targetContent.includes(check.expected)) {
          console.error(`  ✖ Target "${check.target}" missing expected text: "${check.expected}"`);
          scenarioPassed = false;
        } else {
          console.log(`  ✔ [OK] Found: "${check.expected}" in ${check.target}`);
        }
      } else {
        console.warn(`  ⚠ Unknown check type: ${check.type}`);
      }
    }

    if (!scenarioPassed) {
      allPassed = false;
      console.log(`✖ Scenario "${scenario.name}" FAILED.`);
    } else {
      console.log(`✔ Scenario "${scenario.name}" PASSED.`);
    }
  }

  console.log("\n=================================");
  if (allPassed) {
    console.log("All eval scenarios PASSED successfully.");
    return true;
  } else {
    console.error("Some eval scenarios FAILED.");
    return false;
  }
}

const ok = runEvals();
process.exit(ok ? 0 : 1);
