# @fluid-example/bundle-size-tests

This package bundles some commonly used Fluid packages. The webpack output of this package is used for bundle analysis in our ongoing effort to make Fluid fast!

## Comparing bundle sizes

This package can measure how a change affects its webpack bundle by building the
bundle on two different revisions and diffing the per-asset and per-entrypoint
sizes, so regressions (or wins) are easy to spot before pushing.

The workflow is implemented as the `flub bundle` command topic in
[`@fluid-tools/build-cli`](../../../build-tools/packages/build-cli); this package
just invokes it with the appropriate context. The relevant commands are:

| Command                          | Responsibility                                                   |
| -------------------------------- | --------------------------------------------------------------- |
| `flub bundle collect`            | Build one bundle and save its stats under a label.              |
| `flub bundle compare`            | Diff two already-collected bundles and write the report.        |
| `flub bundle collect-and-compare`| Orchestrate both collect steps plus the compare step end-to-end. |

### Running

The orchestrator is exposed as the `compare:bundles` npm script:

```sh
npm run compare:bundles
```

To pass flags, forward them after `--`:

```sh
npm run compare:bundles -- --base-revision client_v2.100.0
```

Each command self-describes its flags via `--help`:

```sh
flub bundle collect --help
flub bundle compare --help
flub bundle collect-and-compare --help
```

### Typical workflow

In almost every case you just want the one-shot orchestrator:

```sh
npm run compare:bundles
```

This compares your working tree against the merge-base of `HEAD` and `main` —
i.e. the point your branch forked from — so the diff reflects only your own
changes, not unrelated commits that have since landed on `main`. Use
`--base-revision` to compare against a different branch, tag, or commit; the
merge-base of that revision and `HEAD` is what actually gets built.

Reach for the lower-level commands when the orchestrator's flow doesn't fit:

- **`flub bundle compare` on its own** — when both bundles are already collected
  and you only want to re-run the diff (e.g. tweaking the report, or comparing
  two labels the orchestrator wouldn't pair automatically). It reads each side's
  previously saved `analyzer.json` and writes a fresh report without rebuilding
  anything.
- **`flub bundle collect` on its own** — when you want to capture a single bundle
  without immediately diffing it, or to pre-populate a label for a later
  comparison.

### How collection works

`flub bundle collect` runs in one of two modes:

- **local** — builds the bundle from the outer enlistment (your working tree,
  including staged changes). The staged diff is captured alongside the report so
  the measurement is reproducible.
- **revision** — builds the bundle from a _separate_ inner clone of the repo
  checked out at a specific commit. The inner clone is created on first use as a
  shallow clone of your `origin` remote and the requested commit is fetched
  shallowly, keeping it small. The outer repo's working tree, branch, and stash
  are never touched.

Each build runs webpack, which emits `bundleAnalyzerJson/analyzer.json`
(webpack-bundle-analyzer's JSON report). That single file carries per-asset
parsed/gzip sizes and entrypoint membership — everything the comparison needs —
so it is the only artifact saved per label; the larger webpack stats and `build/`
outputs are not retained.

The orchestrator runs `flub bundle collect` once in each mode: local for the
current side, revision for the base side. The base-side report is cached and
keyed by the resolved SHA, so a re-run against the same merge-base skips the
rebuild.

### Outputs

- Each label's `analyzer.json` is saved under `bundleAnalysis/<label>/`
  (gitignored). This is also where the cached base report and the inner repo
  clone live.
- Comparison reports (`.txt` and `.json`) are written to `compareBundlesOutput/`
  (gitignored).

Both directories are removed by `npm run clean`.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
