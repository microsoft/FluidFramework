`flub bundle`
=============

Bundle commands collect and compare webpack bundle sizes across revisions.

* [`flub bundle collect`](#flub-bundle-collect)
* [`flub bundle collect-and-compare`](#flub-bundle-collect-and-compare)
* [`flub bundle compare`](#flub-bundle-compare)

## `flub bundle collect`

Build and collect a bundle, either from the outer enlistment (local mode) or from a separate inner enlistment checked out to a specific revision (revision mode). The outer repo's working tree, branch, and stash are never modified.

```
USAGE
  $ flub bundle collect [-v | --quiet] [--revision <value> | --merge-base <value>] [--label <value>] [--package-dir
    <value>] [--analysis-dir <value>] [--force-clean-build]

FLAGS
  --analysis-dir=<value>  Directory under which per-label analyzer stats are saved. Defaults to
                          <package-dir>/compareBundlesOutput/analysis.
  --force-clean-build     Run the full workspace clean ('npm run clean' at the repo root) before building. Off by
                          default; opt in when stale incremental build state from a previous revision may interfere with
                          the current one.
  --label=<value>         Override the directory name under which bundle stats are saved. Defaults to the sanitized
                          revision in revision mode, or a timestamped "current_<epoch>" in local mode.
  --merge-base=<value>    Collect a bundle for the merge-base of HEAD and this committish (the fork point). Selects
                          revision mode and is mutually exclusive with --revision. Also used as the default label.
  --package-dir=<value>   [default: .] Package root whose webpack bundles are built and whose analyzer.json is
                          collected.
  --revision=<value>      Collect a bundle for this committish (branch, tag, commit SHA, or any committish like HEAD~2),
                          resolved as-is via 'git rev-parse'. Selects revision mode and is mutually exclusive with
                          --merge-base; omit both to collect the local working tree. Also used as the default label.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Build and collect a bundle, either from the outer enlistment (local mode) or from a separate inner enlistment checked
  out to a specific revision (revision mode). The outer repo's working tree, branch, and stash are never modified.

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleDetails.md

EXAMPLES
  $ flub bundle collect

  $ flub bundle collect --revision main

  $ flub bundle collect --merge-base main

  $ flub bundle collect --revision client_v2.100.0
```

_See code: [src/commands/bundle/collect.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bundle/collect.ts)_

## `flub bundle collect-and-compare`

Collect the local bundle and the base-revision (merge-base) bundle, then compare them. The outer repo's working tree, branch, and stash are never modified.

```
USAGE
  $ flub bundle collect-and-compare [-v | --quiet] [--base-revision <value>] [--exact-base] [--package-dir <value>]
    [--analysis-dir <value>] [--output-dir <value>] [--force-clean-build] [--keep-base-repo]

FLAGS
  --analysis-dir=<value>   Directory under which per-label analyzer stats are saved. Defaults to an 'analysis'
                           subdirectory of the output directory (e.g. <package-dir>/compareBundlesOutput/analysis).
  --base-revision=<value>  [default: main] Revision to use as the comparison baseline (branch, tag, or commit SHA). The
                           actual base used is the merge-base of HEAD and this revision (the fork point), so
                           worktree-based setups where 'main' is in an unusual location still produce the expected
                           comparison. Pass --exact-base to use the revision as-is instead.
  --exact-base             Use --base-revision exactly as given (resolved via 'git rev-parse') instead of taking the
                           merge-base with HEAD. Useful for comparing the working tree against a specific commit, e.g.
                           the current commit's parent.
  --force-clean-build      Run the full workspace clean before each build. Off by default; opt in when stale incremental
                           build state may interfere with the current revision.
  --keep-base-repo         For debugging only: keep the inner base-repo clone after collecting the base bundle. By
                           default the inner repo is deleted once stats are saved, since it can be re-created cheaply
                           via shallow clone on the next run. Pass this flag to inspect the inner repo's working tree or
                           build output (e.g. when a build is failing inside the inner repo).
  --output-dir=<value>     Directory where the comparison reports are written. Defaults to
                           <package-dir>/compareBundlesOutput.
  --package-dir=<value>    [default: .] Package root whose webpack bundles are built and compared.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Collect the local bundle and the base-revision (merge-base) bundle, then compare them. The outer repo's working tree,
  branch, and stash are never modified.

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleDetails.md

EXAMPLES
  $ flub bundle collect-and-compare

  $ flub bundle collect-and-compare --base-revision main

  $ flub bundle collect-and-compare --base-revision client_v2.100.0

  $ flub bundle collect-and-compare --base-revision 18062854f25 --exact-base

  $ flub bundle collect-and-compare --force-clean-build --keep-base-repo
```

_See code: [src/commands/bundle/collect-and-compare.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bundle/collect-and-compare.ts)_

## `flub bundle compare`

Compare the two bundles previously collected by 'flub bundle collect' (base = --base-label, current = --current-label).

```
USAGE
  $ flub bundle compare [-v | --quiet] [--analysis-dir <value>] [--output-dir <value>] [--base-label <value>]
    [--current-label <value>]

FLAGS
  --analysis-dir=<value>   [default: ./compareBundlesOutput/analysis] Parent directory containing analyzer.json files at
                           {label}/analyzer.json.
  --base-label=<value>     [default: main] Label subdirectory under --analysis-dir holding the base-side bundle stats.
                           Must match the --label passed to 'flub bundle collect' in revision mode.
  --current-label=<value>  [default: current] Label subdirectory under --analysis-dir holding the current-side bundle
                           stats. Must match the --label passed to 'flub bundle collect' in local mode (the orchestrator
                           passes a timestamped label like 'current_<epoch>').
  --output-dir=<value>     [default: ./compareBundlesOutput] Directory where the .txt and .json comparison reports are
                           written.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Compare the two bundles previously collected by 'flub bundle collect' (base = --base-label, current =
  --current-label).

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleDetails.md

EXAMPLES
  $ flub bundle compare

  $ flub bundle compare --base-label some-revision

  $ flub bundle compare --analysis-dir /some/other/path
```

_See code: [src/commands/bundle/compare.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bundle/compare.ts)_
