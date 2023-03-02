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
  $ flub typetests [-v] [-d <value> | --packages | -g client|server|azure|build-tools] [--private | ] [--scope
    <value> | -g client|server|azure|build-tools] [--reset] [-p | --exact <value> | -r | --disable] [-n | --enable]

FLAGS
  -d, --dir=<value>            Run on the package in this directory. Cannot be used with --releaseGroup or --packages.
  -g, --releaseGroup=<option>  Run on all packages within this release group. Cannot be used with --dir or --packages.
                               <options: client|server|azure|build-tools>
  -g, --skipScope=<option>...  Package scopes to filter out.
                               <options: client|server|azure|build-tools>
  -n, --normalize              Removes any unrecognized data from "typeValidation" in the package.json
  -p, --previous               Use the version immediately before the current version.
  -r, --remove                 Remove the test "-previous" version dependency. This is also done implicitly (without
                               this flag) if type tests are disabled.
  -v, --verbose                Verbose logging.
  --disable                    Set the "typeValidation.disabled" setting to "true" in the package.json
  --enable                     Remove the "typeValidation.disabled" setting in the package.json
  --exact=<value>              An exact string to use as the previous version constraint. The string will be used as-is.
  --packages                   Run on all independent packages in the repo. This is an alternative to using the --dir
                               flag for independent packages.
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --reset                      Resets the broken type test settings in package.json.
  --scope=<value>...           Package scopes to filter to.

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
