`flub check`
============

Check commands are used to verify repo state, apply policy, etc.

* [`flub check layers`](#flub-check-layers)
* [`flub check policy`](#flub-check-policy)

## `flub check layers`

Checks that the dependencies between Fluid Framework packages are properly layered.

```
USAGE
  $ flub check layers --info <value> [-v] [--md <value>] [--dot <value>] [--logtime]

FLAGS
  -v, --verbose   Verbose logging.
  --dot=<value>   Generate *.dot for GraphViz
  --info=<value>  (required) Path to the layer graph json file
  --logtime       Display the current time on every status message for logging
  --md=<value>    Generate PACKAGES.md file at this path relative to repo root

DESCRIPTION
  Checks that the dependencies between Fluid Framework packages are properly layered.
```

## `flub check policy`

Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.

```
USAGE
  $ flub check policy -e <value> [-v] [-D <value> | -d <value>] [--listHandlers | --stdin | -p <value> | -f | ]

FLAGS
  -D, --excludeHandler=<value>...  Exclude handler by name. Can be specified multiple times to exclude multiple
                                   handlers.
  -d, --handler=<value>            Filter handler names by <regex>.
  -e, --exclusions=<value>         (required) Path to the exclusions.json file.
  -f, --fix                        Fix errors if possible.
  -p, --path=<value>               Filter file paths by <regex>.
  -v, --verbose                    Verbose logging.
  --listHandlers                   List all policy handlers by name.
  --stdin                          Read list of files from stdin.

DESCRIPTION
  Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files,
  assert tagging, etc.
```
