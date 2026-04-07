# Tree-specific API check guidance

This document is read by the `ci-readiness-check` skill when `@fluidframework/tree` is among the changed packages. Follow these instructions **in addition to** the general steps in `SKILL.md`.

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

## After running `build:api-reports`: check for phantom key-reorder diffs

There is a known bug in API Extractor that non-deterministically reorders union key strings within `Omit<>` type signatures in this package — e.g. `"keyA" | "keyB"` swapped to `"keyB" | "keyA"` — with no real API change. The ordering is stable within a single fresh compilation (local and CI agree), but it can silently flip between compilations after clearing `tsbuildinfo` or after TypeScript version changes.

A diff is a phantom key-reorder if: only the order of string literal keys in an `Omit<>` changes; nothing is added or removed.

**Always commit the file that `build:api-reports` produces.** Do not manually flip key order or restore from git. The local fresh build and CI agree on the same ordering, so the build output is exactly what CI expects. If you restore the old order, CI will fail.

There are two situations:

1. **The only diff is key reorderings** (no real API additions/removals): Commit the updated file. The reordering is spurious but CI requires it.

2. **The diff contains both real API changes and key reorderings:** Commit the entire file as-is. Both the real changes and the reorderings match what CI will produce.

---

## After tree reports updated: cascade to aggregator packages

If `@fluidframework/tree`'s API reports actually changed (check `git diff` on `packages/dds/tree/api-report/`), also regenerate the reports for packages that re-export from it:

```bash
cd packages/framework/fluid-framework && pnpm exec fluid-build . -t build:api-reports
cd packages/service-clients/azure-client && pnpm exec fluid-build . -t build:api-reports
```

If the tree reports are unchanged, skip this — the aggregator reports won't change either.

After running either of these, apply the same phantom key-reorder check above — the same bug affects their reports for the same reason.
