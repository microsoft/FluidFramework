# Further information about the bundle-analysis commands

The bundle-analysis commands measure how a change affects a package's webpack
bundle by building the bundle on two different revisions and diffing the
per-asset and per-package sizes, so regressions (or wins) are easy to spot
before pushing.

See [generate.md](./generate.md) and [check.md](./check.md) for the generated
command reference. This document explains how the commands fit together and how
to read the comparison report.

## The commands

| Command                                           | Responsibility                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `flub generate bundleAnalysisRepo`                | Build one bundle and save its stats under a label.               |
| `flub check bundleAnalysisReposComparison`        | Diff two already-collected bundles and write the report.         |
| `flub generate bundleAnalysisReposWithComparison` | Orchestrate both collect steps plus the compare step end-to-end. |

Each collected bundle is identified by a **label** — the name of the subdirectory
under `compareBundlesOutput/analysis/` where that bundle's `analyzer.json` is written.
`flub generate bundleAnalysisRepo` assigns the label automatically: the sanitized
revision it built in revision mode, or a timestamped `current_<epoch>` for the
local working tree. `flub check bundleAnalysisReposComparison` then selects which
two saved bundles to diff by their labels (`--base-label` and `--current-label`).

Each command self-describes its flags via `--help`:

```sh
flub generate bundleAnalysisRepo --help
flub check bundleAnalysisReposComparison --help
flub generate bundleAnalysisReposWithComparison --help
```

## Typical workflow

In almost every case you just want the one-shot orchestrator:

```sh
flub generate bundleAnalysisReposWithComparison
```

This compares your working tree against the merge-base of `HEAD` and `main` —
i.e. the point your branch forked from — so the diff reflects only your own
changes, not unrelated commits that have since landed on `main`. Use
`--base-revision` to compare against a different branch, tag, or commit; the
merge-base of that revision and `HEAD` is what actually gets built.

Reach for the lower-level commands when the orchestrator's flow doesn't fit:

- **`flub check bundleAnalysisReposComparison` on its own** — when both bundles are
  already collected and you only want to re-run the diff (e.g. tweaking the
  report, or comparing two labels the orchestrator wouldn't pair automatically).
  It reads each side's previously saved `analyzer.json` and writes a fresh report
  without rebuilding anything.
- **`flub generate bundleAnalysisRepo` on its own** — when you want to capture a
  single bundle without immediately diffing it, or to pre-populate a label for a
  later comparison.

## How collection works

`flub generate bundleAnalysisRepo` runs in one of two modes:

- **local** — builds the bundle from the outer enlistment (your working tree,
  including staged changes). The staged diff is captured alongside the report so
  the measurement is reproducible. The outer repo's git state (working tree,
  branch, revision) is never modified.
- **revision** — builds the bundle from a _separate_ inner clone of the repo
  checked out at a specific commit. The inner clone is created on first use by
  cloning directly from the outer enlistment on disk — no remote or network
  access is involved, and every object the outer repo already has (including
  merge-base commits that aren't branch tips) is available without a fetch. The
  requested commit must therefore already exist locally in the outer repo. When
  the inner clone is reused across runs, its branch refs are re-fetched from the
  outer enlistment first, so commits the outer repo has gained since the clone
  (including a freshly-resolved merge-base) are present before checkout; this
  still reads only the outer enlistment on disk. The outer repo's working tree,
  branch, and stash are never touched.

Each build runs webpack, which emits `bundleAnalyzerJson/analyzer.json`
(webpack-bundle-analyzer's JSON report). That single file carries per-asset
parsed/gzip sizes and per-module breakdowns — everything the comparison needs —
so it is the only artifact saved per label; the larger webpack stats and `build/`
outputs are not retained.

The orchestrator runs `flub generate bundleAnalysisRepo` once in each mode: local
for the current side, revision for the base side. The base-side report is cached
and keyed by the resolved SHA, so a re-run against the same merge-base skips the
rebuild.

## Outputs

- Each label's `analyzer.json` is saved under `compareBundlesOutput/analysis/<label>/`. This is
  also where the cached base report and the inner repo clone live.
- Comparison reports (`.txt` and `.json`) are written to `compareBundlesOutput/`.

## Understanding the report

The comparison report is emitted in two forms with identical data: a
human-readable `.txt` table dump and a structured `.json` file. Every table is a
list of rows, and each row reports the same three numbers for one named thing — a
`Base` size, a `Current` size, and their `Diff` (`Current - Base`, so negative
means smaller). Some tables add a base-relative `% Change` column.

Two different size _measurements_ appear in the report, both read straight from
webpack-bundle-analyzer's `analyzer.json` (no separate gzipping or stats
decompression is done):

- **Parsed size** — the minified bytes of the code as it ships, before transport
  compression. This is the default unit for every table except the gzip one.
- **Gzip size** — the gzipped bytes, i.e. what actually goes over the wire.

The report measures the bundle at three different _granularities_, each answering a
different question:

| Table                                        | Granularity | Unit   | What it answers                                                       |
| -------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------- |
| All assets                                   | Asset       | Parsed | How did each emitted `.js` file change?                              |
| Gzip sizes for changed assets                | Asset       | Gzip   | For the assets whose gzip size moved, what is the over-the-wire delta?|
| Bundle composition by category               | Package set | Parsed | How is a bundle split between Fluid Framework and third-party code?  |
| Per-package parsed-size comparison           | Package     | Parsed | Which individual package contributed each chunk of bytes?           |

### Asset tables

An **asset** is a single file webpack emits (e.g. `sharedTree.js`). The _All
assets_ table lists every emitted `.js` asset (source maps excluded) whether it
changed or not, marking changed rows with a trailing `*`; it is the canonical
"here is everything that ships" inventory.

The _Gzip sizes for changed assets_ table is a focused supplement: it lists only
the assets whose **gzip** size actually changed, so it stays short and signal-only.
Note its filter is on the gzip delta itself — an asset can move in parsed size but
not gzip (compression absorbs the change), or vice versa, so this table is not
simply the changed rows of the parsed table re-expressed in gzip bytes.

### Package-level tables

The last two tables attribute bytes to the npm package that owns each module.
This attribution is deliberately careful:

- **Module -> package.** Each module's path is mapped to its owning package:
  third-party packages by the name after the last `node_modules/`, Fluid source
  packages by their `packages/<group>/<name>` workspace path (reported as
  `@fluidframework/<name>`), and the synthetic entrypoint's own modules as `(app/entry)`.
- **Scope-hoisting is undone.** When webpack concatenates (scope-hoists) modules
  it prefixes each module's path with the concatenating barrel. That prefix is
  stripped before attribution so hoisted modules are credited to their _real_
  owning package rather than collapsing onto the barrel.
- **Deduplicated per bundle.** Within a given entrypoint, a module reached more
  than once is counted exactly once.

Because shared modules can't be split across entrypoints without double-counting,
each package-level measurement is **pinned to a single real entrypoint** rather
than summed across the whole report. Every package-level table is measured from
SharedTree's own `sharedTree` bundle.

The _Bundle composition by category_ table rolls those per-package sizes up into
headline buckets. For the pinned `sharedTree` entrypoint it reports the bundle's
total Fluid Framework bytes, and a companion `+ 3rd-party deps` row that also
folds in every third-party package in that same bundle. (Third-party bytes can't
be split between the Fluid libraries that pull them in, because the flat
per-package data carries no dependency graph; synthetic entrypoint code is always
excluded.)

The _Per-package parsed-size comparison_ table is the full breakdown for the
`sharedTree` bundle: one row per owning package, sorted by current size
descending, so the biggest contributors — and the biggest movers — are easy to
find.
