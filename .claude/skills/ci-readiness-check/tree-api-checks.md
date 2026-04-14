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

There is a known incremental TypeScript compilation bug that non-deterministically reorders union key strings within `Omit<>` type signatures in this package — e.g. `"keyA" | "keyB"` swapped to `"keyB" | "keyA"` — with no real API change. This is a bug in TypeScript's incremental build and flows downstream to API extractor. It only occurs with incremental builds; clean builds produce deterministic, stable output that matches CI.

A diff is a phantom key-reorder if: only the order of string literal keys in an `Omit<>` changes; nothing is added or removed.

**If you see phantom key-reorder diffs, do a clean build and regenerate:**

```bash
cd packages/dds/tree && pnpm exec fluid-build . --task clean && pnpm exec fluid-build . --task compile
pnpm exec fluid-build . -t build:api-reports
```

CI always runs clean builds, so a local clean build will produce the same output CI expects. After the clean rebuild, the spurious reorderings will be gone.

---

## After tree reports updated: cascade to aggregator packages

If `@fluidframework/tree`'s API reports actually changed (check `git diff` on `packages/dds/tree/api-report/`), also regenerate the reports for packages that re-export from it:

```bash
cd packages/framework/fluid-framework && pnpm exec fluid-build . -t build:api-reports
cd packages/service-clients/azure-client && pnpm exec fluid-build . -t build:api-reports
```

If the tree reports are unchanged, skip this — the aggregator reports won't change either.

After running either of these, check for phantom key-reorder diffs — the same incremental TypeScript bug can affect their reports. If you see any, do a clean build of the affected aggregator package and regenerate its API reports (same approach as above).
