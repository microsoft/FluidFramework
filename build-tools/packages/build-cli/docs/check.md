`flub check`
============

Check commands are used to verify repo state, apply policy, etc.

* [`flub check buildVersion`](#flub-check-buildversion)
* [`flub check changeset`](#flub-check-changeset)
* [`flub check layers`](#flub-check-layers)
* [`flub check policy`](#flub-check-policy)

## `flub check buildVersion`

Checks that all packages have the same version set in package.json. The packages checked can be filtered by standard criteria. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.

```
USAGE
  $ flub check buildVersion [-v] [-a | -d <value> | --packages | -g client|server|azure|build-tools|gitrest|historian]
    [--releaseGroupRoots] [--private] [--scope <value> | -g client|server|azure|build-tools|gitrest|historian]
    [--version <value> | --path <value>] [--fix]

FLAGS
  -a, --all                    Run on all packages and release groups. Cannot be used with --dir, --packages, or
                               --releaseGroup.
  -d, --dir=<value>            Run on the package in this directory. Cannot be used with --all, --packages, or
                               --releaseGroup.
  -g, --releaseGroup=<option>  Run on all packages within this release group. Cannot be used with --all, --dir, or
                               --packages.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -g, --skipScope=<option>...  Package scopes to filter out.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --fix                        Fix invalid versions in the package.json file.
  --packages                   Run on all independent packages in the repo. Cannot be used with --all, --dir, or
                               --releaseGroup.
  --path=<value>               Path to a directory containing a package. The version will be loaded from the
                               package.json in this directory.
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --releaseGroupRoots          Runs only on the root package of release groups. Can only be used with --all or
                               --releaseGroup.
  --scope=<value>...           Package scopes to filter to.
  --version=<value>            The version against which to check all the packages.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Checks that all packages have the same version set in package.json. The packages checked can be filtered by standard
  criteria. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.
```

## `flub check changeset`

Checks if a changeset was added when compared against a branch. This is used in CI to enforce that changesets are present for a PR.

```
USAGE
  $ flub check changeset -b <value> [-v] [--json]

FLAGS
  -b, --branch=<value>  (required) The branch to compare against.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.
  --json         Format output as json.

EXAMPLES
  Check if a changeset was added when compared to the 'main' branch.

    $ flub check changeset -b main

  Check if a changeset was added when compared to the 'next' branch.

    $ flub check changeset -b next
```

## `flub check layers`

Checks that the dependencies between Fluid Framework packages are properly layered.

```
USAGE
  $ flub check layers --info <value> [-v] [--md <value>] [--dot <value>] [--logtime]

FLAGS
  --dot=<value>   Generate *.dot for GraphViz
  --info=<value>  (required) Path to the layer graph json file
  --logtime       Display the current time on every status message for logging
  --md=<value>    Generate PACKAGES.md file at this path relative to repo root

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Checks that the dependencies between Fluid Framework packages are properly layered.
```

## `flub check policy`

Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.

```
USAGE
  $ flub check policy [-v] [-D <value> | -d <value>] [-e <value>] [--listHandlers | --stdin | -p <value> | -f | ]

FLAGS
  -D, --excludeHandler=<value>...  Exclude handler by name. Can be specified multiple times to exclude multiple
                                   handlers.
  -d, --handler=<value>            Filter handler names by <regex>.
  -e, --exclusions=<value>         Path to the exclusions.json file.
  -f, --fix                        Fix errors if possible.
  -p, --path=<value>               Filter file paths by <regex>.
  --listHandlers                   List all policy handlers by name.
  --stdin                          Read list of files from stdin.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files,
  assert tagging, etc.
```
