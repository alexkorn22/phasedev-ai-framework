import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { resolveRoute } from "../phase-control/flow-route";

export interface ChangeEntry {
  name: string;
  type: "active" | "archived";
  phase?: string;
  routeKind?: string;
  archiveDate?: string;
  archiveStatus?: string;
}

export function listChanges(projectPath: string): ChangeEntry[] {
  const changesDir = path.join(projectPath, SYSTEM_DIR, "changes");
  const archiveDir = path.join(changesDir, "archive");
  const entries: ChangeEntry[] = [];

  // Active changes
  if (fs.existsSync(changesDir)) {
    const items = fs.readdirSync(changesDir);
    for (const item of items) {
      const fullPath = path.join(changesDir, item);
      if (item === "archive" || item.startsWith(".")) continue;
      if (!fs.statSync(fullPath).isDirectory()) continue;

      const route = resolveRoute(projectPath);
      entries.push({
        name: item,
        type: "active",
        phase: route.phase,
        routeKind: route.kind
      });
    }
  }

  // Archived changes
  if (fs.existsSync(archiveDir)) {
    const archivedItems = fs.readdirSync(archiveDir);
    for (const item of archivedItems) {
      const fullPath = path.join(archiveDir, item);
      if (!fs.statSync(fullPath).isDirectory()) continue;

      const archiveJsonPath = path.join(fullPath, ".phase-archive.json");
      let archiveStatus = "unknown";
      let archiveDate = "";

      if (fs.existsSync(archiveJsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(archiveJsonPath, "utf-8"));
          archiveStatus = data.status ?? "unknown";
        } catch {
          archiveStatus = "malformed";
        }
      }

      // Extract date from folder name pattern YYYY-MM-DD-<name>
      const dateMatch = item.match(/^(\d{4}-\d{2}-\d{2})-/);
      if (dateMatch) {
        archiveDate = dateMatch[1];
      }

      entries.push({
        name: item,
        type: "archived",
        archiveDate,
        archiveStatus
      });
    }
  }

  return entries;
}

export function renderChanges(entries: ChangeEntry[]): string {
  if (entries.length === 0) {
    return "No changes found.";
  }

  const lines: string[] = [];
  lines.push("=== PhaseDev Changes ===");
  lines.push("");

  const active = entries.filter(e => e.type === "active");
  const archived = entries.filter(e => e.type === "archived");

  if (active.length > 0) {
    lines.push("--- Active Changes ---");
    for (const entry of active) {
      lines.push(`  ${entry.name}`);
      if (entry.routeKind) {
        lines.push(`    Route: ${entry.routeKind}`);
      }
      if (entry.phase) {
        lines.push(`    Phase: ${entry.phase}`);
      }
    }
    lines.push("");
  }

  if (archived.length > 0) {
    lines.push("--- Archived Changes ---");
    for (const entry of archived) {
      const dateStr = entry.archiveDate ? ` [${entry.archiveDate}]` : "";
      lines.push(`  ${entry.name}${dateStr} (status: ${entry.archiveStatus})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
