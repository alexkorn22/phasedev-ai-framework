# Runnable Forms: Regression Fence and Proof Guards

## Regression fence — whole-set form

Fastest; use when the fence is a directory or glob:

```bash
BASE="$(git merge-base origin/main HEAD)"   # or the declared base SHA

git diff --quiet "$BASE"..HEAD -- tests/ || {
  echo "FENCE VIOLATED: $(git diff --name-only "$BASE"..HEAD -- tests/ | tr '\n' ' ')"; exit 1; }
```

## Regression fence — per-file form

Use when the fence is an explicit list, or you need to report which file moved. Compares blob hashes, so it is exact: identical content is the same hash regardless of path or mtime.

```bash
for f in $FENCE_FILES; do
  # --verify --quiet is REQUIRED, not stylistic: plain `git rev-parse "HEAD:missing"` exits 128
  # but still ECHOES the input string to stdout — so a naive `|| echo MISSING` captures BOTH
  # lines and the comparison silently becomes garbage, missing the deletion it should catch.
  b0="$(git rev-parse --verify --quiet "$BASE:$f" || echo MISSING_BASE)"
  b1="$(git rev-parse --verify --quiet "HEAD:$f"  || echo MISSING_HEAD)"
  [ "$b0" = "$b1" ] || echo "FENCE VIOLATED: $f ($b0 -> $b1)"
done
```

`MISSING_HEAD` means the file was deleted, `MISSING_BASE` that it is new — both are fence violations.

## Exit-code guards

Expect-zero-matches gate (grep exits 1 on zero matches — never gate on it directly):

```bash
test "$(some_command | grep -c PATTERN)" -eq 0
```

Pinned-base diff gate (unpinned `--exit-code` passes vacuously after commit):

```bash
git diff --exit-code "$(git merge-base HEAD origin/main)" -- <paths>
```

Pipelines: the exit status is the last command's — set `set -o pipefail` when any stage matters.

Filtered test run must prove it ran (a filter matching nothing reports green):

```bash
out=$(npx vitest run <file> -t "<title>" 2>&1); echo "$out"
echo "$out" | grep -qE 'Tests +[1-9][0-9]* passed' || { echo 'PROOF DID NOT RUN'; exit 1; }
```

Tell the test author to put the criterion id in the test title, so the filter can only match the intended test.
