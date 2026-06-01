# Bundle comparison scripts

These scripts measure how a change affects the webpack bundle produced by
`@fluid-example/bundle-size-tests`. They build the bundle on two different
revisions and diff the per-asset and per-entrypoint sizes so regressions (or
wins) are easy to spot before pushing.

Scripts:

| Script                        | Responsibility                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `collectBundle.ts`            | Build one bundle and save its stats under a label.                             |
| `compareBundles.ts`           | Diff two already-collected bundles and write the report.                       |
| `collectAndCompareBundles.ts` | Orchestrate both collect steps plus the compare step end-to-end.               |

The orchestrator is the entry point exposed as the `compare:bundles` npm
script; the other two are building blocks you usually only reach for when you
want finer control or are debugging a single step.

## Running the scripts

Run the orchestrator through the package script:

```sh
npm run compare:bundles
```

To pass flags, forward them after `--`:

```sh
npm run compare:bundles -- --base-revision client_v2.100.0
```

Only collectAndCompareBundles is exposed as an npm script. Invoke other scripts directly with
[jiti](https://github.com/unjs/jiti), which runs the TypeScript sources without a
separate compile step. Each script self-describes its flags via `--help`:

```sh
jiti ./scripts/collectBundle.ts --help
jiti ./scripts/compareBundles.ts --help
jiti ./scripts/collectAndCompareBundles.ts --help
```

## Typical workflow

In almost every case you just want the one-shot orchestrator:

```sh
npm run compare:bundles
```

This compares your working tree against the merge-base of `HEAD` and `main` —
i.e. the point your branch forked from — so the diff reflects only your own
changes, not unrelated commits that have since landed on `main`. Use
`--base-revision` to compare against a different branch, tag, or commit; the
merge-base of that revision and `HEAD` is what actually gets built.

Reach for the lower-level scripts when the orchestrator's flow doesn't fit:

- **`compareBundles.ts` on its own** — when both bundles are already collected
  and you only want to re-run the diff (e.g. tweaking the report, or comparing
  two labels the orchestrator wouldn't pair automatically). It reads each side's
  previously saved `analyzer.json` and writes a fresh report without rebuilding
  anything.
- **`collectBundle.ts` on its own** — when you want to capture a single bundle
  without immediately diffing it, or to pre-populate a label for a later
  comparison.

### How collection works

`collectBundle.ts` runs in one of two modes:

- **local** — builds the bundle from the outer enlistment (your working tree,
  including staged changes). The staged diff is captured alongside the report so
  the measurement is reproducible.
- **revision** — builds the bundle from a *separate* inner clone of the repo
  checked out at a specific commit. The inner clone is created on first use as a
  shallow clone of your `origin` remote and the requested commit is fetched
  shallowly, keeping it small. The outer repo's working tree, branch, and stash
  are never touched.

Each build runs webpack, which emits `bundleAnalyzerJson/analyzer.json`
(webpack-bundle-analyzer's JSON report). That single file carries per-asset
parsed/gzip sizes and entrypoint membership — everything the comparison needs —
so it is the only artifact saved per label; the larger webpack stats and `build/`
outputs are not retained.

The orchestrator runs `collectBundle.ts` once in each mode: local for the
current side, revision for the base side. The base-side report is cached and
keyed by the resolved SHA, so a re-run against the same merge-base skips the
rebuild.

## Outputs

- Each label's `analyzer.json` is saved under `bundleAnalysis/<label>/`
  (gitignored). This is also where the cached base report and the inner repo
  clone live.
- Comparison reports (`.txt` and `.json`) are written to `compareBundlesOutput/`
  (gitignored).

Both directories are removed by `npm run clean`.
