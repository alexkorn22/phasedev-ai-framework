import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const readmePath = path.join(repoRoot, "README.md");

const BADGE_PATTERN = /(img\.shields\.io\/badge\/version-)([^)\s]*?)(-blue)/;

/**
 * shields.io badge paths use `-` as the field separator, so a literal dash in
 * the message (e.g. a prerelease like `1.4.0-rc.1`) must be doubled.
 */
function encodeBadgeMessage(version: string): string {
  return version.replace(/-/g, "--").replace(/_/g, "__");
}

function readVersion(): string {
  const raw = fs.readFileSync(packageJsonPath, "utf-8");
  const { version } = JSON.parse(raw) as { version?: string };
  if (!version) throw new Error("package.json has no version field");
  return version;
}

function syncVersionBadge(): void {
  const version = readVersion();
  const readme = fs.readFileSync(readmePath, "utf-8");

  if (!BADGE_PATTERN.test(readme)) {
    throw new Error("README.md has no shields.io version badge to sync");
  }

  const updated = readme.replace(BADGE_PATTERN, `$1${encodeBadgeMessage(version)}$3`);
  if (updated === readme) {
    console.log(`README version badge already at ${version}`);
    return;
  }

  fs.writeFileSync(readmePath, updated, "utf-8");
  console.log(`README version badge synced to ${version}`);
}

syncVersionBadge();
