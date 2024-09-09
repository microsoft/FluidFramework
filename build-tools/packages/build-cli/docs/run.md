`flub run`
==========

Generate a report from input bundle stats collected through the collect bundleStats command.

* [`flub run bundleStats`](#flub-run-bundlestats)
* [`flub run codeCoverageStats`](#flub-run-codecoveragestats)

## `flub run bundleStats`

Generate a report from input bundle stats collected through the collect bundleStats command.

```
USAGE
  $ flub run bundleStats [-v | --quiet] [--dangerfile <value>]

FLAGS
  --dangerfile=<value>  Path to dangerfile

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Generate a report from input bundle stats collected through the collect bundleStats command.
```

_See code: [src/commands/run/bundleStats.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/run/bundleStats.ts)_

## `flub run codeCoverageStats`

Run comparison of code coverage stats

```
USAGE
  $ flub run codeCoverageStats [-v | --quiet] [--dangerfile <value>]

FLAGS
  --dangerfile=<value>  Path to dangerfile

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Run comparison of code coverage stats
```

_See code: [src/commands/run/codeCoverageStats.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/run/codeCoverageStats.ts)_
