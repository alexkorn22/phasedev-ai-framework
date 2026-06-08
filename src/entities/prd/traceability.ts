import * as fs from "fs";

export interface PrdTraceIds {
  requirements: string[];
  criteria: string[];
}

export function extractRequirementsAndCriteriaFromPrd(prdPath: string): PrdTraceIds {
  if (!fs.existsSync(prdPath)) {
    return { requirements: [], criteria: [] };
  }

  const content = fs.readFileSync(prdPath, "utf-8");
  const lines = content.split("\n");
  const requirements: string[] = [];
  const criteria: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection === "requirements") {
      const match = line.match(/[-*]\s+(R\d+):/);
      if (match) {
        requirements.push(match[1]);
      }
    } else if (currentSection === "success criteria") {
      const match = line.match(/[-*]\s+(SC\d+):/);
      if (match) {
        criteria.push(match[1]);
      }
    }
  }

  return { requirements, criteria };
}
