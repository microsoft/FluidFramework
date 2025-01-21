`flub typetests`
================

Updates configuration for type tests in package.json files. If the previous version changes after running preparation, then npm install must be run before building.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during configuration. This is useful when resetting the type tests to a clean state, such as after a release.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.

* [`flub typetests`](#flub-typetests)

## `flub typetests`

Updates configuration for type tests in package.json files. If the previous version changes after running preparation, then npm install must be run before building.

```
USAGE
  $ flub typetests [-v | --quiet] [--reset] [-p | --exact <value> | -r | --disable] [-n | --enable]
    [--concurrency <value>] [--branch <value> [--changed | [--all | --dir <value>... | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all... | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all...]]] [--private] [--scope <value>... | --skipScope
    <value>...]

FLAGS
  -n, --normalize
      Removes any unrecognized data from "typeValidation" in the package.json and adds any missing default settings.

  -p, --previous
      Use the version immediately before the current version.

      This is done by decrementing the least significant non-zero component (as separated by ".").

      This means that "1.2.3" to "1.2.2" and "1.2.0" to "1.1.0".

      This usually produces the version of the release that was made closest to the current version from a branch
      perspective.
      For example if the version on main is "1.2.3",
      the closest release history wise would be the first release of the previous minor, so "1.1.0" even if there were
      other point releases on the "1.1" branch.

      If targeting prerelease versions, skipping versions, or using skipping some alternative numbering scheme use
      "--exact" to specify the desired version instead.

  -r, --remove
      Remove the test "-previous" version dependency. This is also done implicitly (without this flag) if type tests are
      disabled.

  --concurrency=<value>
      [default: 25] The number of tasks to execute concurrently.

  --disable
      Set the "typeValidation.disabled" setting to "true" in the package.json.

  --enable
      Remove the "typeValidation.disabled" setting in the package.json.

  --exact=<value>
      An exact string to use as the previous version constraint. The string will be used as-is.

  --reset
      Resets the broken type test settings in package.json.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...      Run on all child packages within the specified release groups. This does not
                                      include release group root packages. To include those, use the --releaseGroupRoot
                                      argument. Cannot be used with --all.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>
      --all                           Run on all packages and release groups. Cannot be used with --dir, --packages,
                                      --releaseGroup, or --releaseGroupRoot.
      --branch=<value>                [default: main] Select only packages that have been changed when compared to this
                                      base branch. Can only be used with --changed.
      --changed                       Select packages that have changed when compared to a base branch. Use the --branch
                                      option to specify a different base branch. Cannot be used with --all.
      --dir=<value>...                Run on the package in this directory. Cannot be used with --all.
      --packages                      Run on all independent packages in the repo. Cannot be used with --all.
      --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                      child packages within the release group. To include those, use the --releaseGroup
                                      argument. Cannot be used with --all.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Updates configuration for type tests in package.json files. If the previous version changes after running preparation,
  then npm install must be run before building.

  Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during
  configuration. This is useful when resetting the type tests to a clean state, such as after a release.

  To learn more about how to configure type tests, see the detailed documentation at
  <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.

EXAMPLES
  Update type test configuration in package.json for all packages in the client. This is what would be run for client
  minor releases on both the release branch and the main branch after the version bump and publishing of the first
  point release of that minor.

    $ flub typetests -g client --reset --previous

  Disable type tests and cleanup anything left related to them in the package.json other than the disable flag.

    $ flub typetests --reset --normalize --disable
```

_See code: [src/commands/typetests.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/typetests.ts)_
