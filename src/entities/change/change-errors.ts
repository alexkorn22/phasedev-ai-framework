export class UnknownChangeError extends Error {
  constructor(readonly changeName: string, readonly available: string[]) {
    super(`Unknown change "${changeName}". Available changes: ${available.length > 0 ? available.join(", ") : "none"}.`);
    this.name = "UnknownChangeError";
  }
}

export class AmbiguousChangeError extends Error {
  constructor(readonly changeNames: string[]) {
    super(`Multiple changes exist: ${changeNames.join(", ")}. Pass --change <name>.`);
    this.name = "AmbiguousChangeError";
  }
}

export class MissingPhasedevDirError extends Error {
  constructor(readonly projectRoot: string) {
    super(`No .phasedev directory found at ${projectRoot}. Run from the project root or pass --project-path.`);
    this.name = "MissingPhasedevDirError";
  }
}
