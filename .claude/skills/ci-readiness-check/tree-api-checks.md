# Tree-specific API check guidance

Guidance for working with API reports in `@fluidframework/tree` and its downstream aggregators (`fluid-framework`). Read this whenever you encounter unexpected API report diffs in these packages.

---

## Before running `build:api-reports`: regenerate entrypoint sources if `index.ts` changed

`@fluidframework/tree` uses committed files in `src/entrypoints/` (e.g. `src/entrypoints/alpha.ts`) that explicitly list every named export by API tier. These must be kept in sync with `src/index.ts`.

**Run `generate:entrypoint-sources` if you touched `src/index.ts`** — this covers all cases that affect the entrypoints: adding or removing a top-level export, and changing the API tier of an existing export (e.g. promoting something from `@alpha` to `@public`). If your changes didn't touch `src/index.ts` at all, skip this step.

```bash
cd packages/dds/tree && pnpm run generate:entrypoint-sources
```

This script writes to both `src/entrypoints/*.ts` and `lib/entrypoints/*.d.ts`. The `lib/` copy has wrong import paths and must be fixed by rebuilding immediately after:

```bash
pnpm run build:esnext
```

Verify the fix: `grep "from " lib/entrypoints/public.d.ts` should show `../index.js`, not `./index.js`. Then stage the `src/entrypoints/` changes and proceed to `build:api-reports`.

---

## Handling unexpected API report diffs

There is a known incremental TypeScript compilation bug that affects `@fluidframework/tree` and its downstream aggregator packages (`fluid-framework`). It non-deterministically reorders union key strings within `Omit<>` type signatures — e.g. `"keyA" | "keyB"` swapped to `"keyB" | "keyA"` — and can also cause spurious additions or removals of unrelated API entries. This is a bug in TypeScript's incremental build that flows downstream to API Extractor. It **only** occurs with incremental builds; full clean builds produce deterministic, stable output that matches CI.

**The golden rule: if you see ANY unexpected API report changes that are not directly related to your code changes, you must do a full clean build from the repo root.** Do not attempt to fix API reports by hand-editing, by checking them out from another branch, or by doing scoped per-package cleans. These approaches are unreliable because stale artifacts in *dependency* packages can cause wrong output even if the target package itself is clean.

### What "unexpected" looks like

- Union member reordering (e.g. `A | B` changed to `B | A`) with nothing added or removed
- Entire APIs appearing or disappearing from reports for packages you didn't change
- Beta/legacy.beta reports changing when you only made alpha-level changes
- Aggregator package reports (`fluid-framework`) picking up unrelated diffs

### The fix: full clean build from the repo root

**Before starting the clean build, tell the user what you're doing and why.** The build takes several minutes, so the user should not be left wondering. Example message:

> I noticed some unexpected API report changes unrelated to your code. This is caused by a known incremental TypeScript build bug that affects the tree package. I need to do a full clean build from the repo root to get correct API reports — this will take a few minutes.

```bash
# From the repo root — no shortcuts, no scoped cleans
pnpm clean
pnpm build
```

This takes longer but is the **only** reliable way to produce API reports that match CI. The full build includes API report generation for all packages (including the `fluid-framework` aggregator), so no separate regeneration step is needed. Check the reports afterward — if only your intended changes appear, you're good.

**Never hand-edit `*.api.md` files** — they are generated artifacts. If they're wrong, the fix is always to rebuild and regenerate, not to edit them directly.
