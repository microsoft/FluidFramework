`flub check`
============

Check commands are used to verify repo state, apply policy, etc.

* [`flub check layers`](#flub-check-layers)
* [`flub check policy`](#flub-check-policy)

## `flub check layers`

Checks that the dependencies between Fluid Framework packages are properly layered.

```
USAGE
  $ flub check layers [--md <value>] [--dot <value>] [--info <value>] [--logtime] [-v]

FLAGS
  -v, --verbose   Verbose logging.
  --dot=<value>   Generate *.dot for GraphViz
  --info=<value>  Path to the layer graph json file
  --logtime       Display the current time on every status message for logging
  --md=<value>    [default: .] Generate PACKAGES.md file at this path relative to repo root

DESCRIPTION
  Checks that the dependencies between Fluid Framework packages are properly layered.
```

## `flub check policy`

Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.

```
USAGE
  $ flub check policy -e <value> [-f] [-d <value>] [-p <value>] [--stdin] [-v]

FLAGS
  -d, --handler=<value>     Filter handler names by <regex>
  -e, --exclusions=<value>  (required) Path to the exclusions.json file
  -f, --fix                 Fix errors if possible
  -p, --path=<value>        Filter file paths by <regex>
  -v, --verbose             Verbose logging.
  --stdin                   Get file from stdin

DESCRIPTION
  Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files,
  assert tagging, etc.
```
