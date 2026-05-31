import { pathToFileURL } from "url";

export function isMainModule(importMeta: ImportMeta, argv = process.argv): boolean {
  return Boolean((importMeta as { main?: boolean }).main) || importMeta.url === pathToFileURL(argv[1] ?? "").href;
}
