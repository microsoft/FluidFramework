`flub run`
==========

Generate a report from input bundle stats collected through the collect bundleStats command.

* [`flub run bundleStats`](#flub-run-bundlestats)

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

ALIASES
  $ flub publish bundleStats
```

_See code: [src/commands/run/bundleStats.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/run/bundleStats.ts)_
