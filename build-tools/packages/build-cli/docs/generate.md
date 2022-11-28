`flub generate`
===============

Generate commands are used to create/update code, docs, readmes, etc.

* [`flub generate buildVersion`](#flub-generate-buildversion)
* [`flub generate bundleStats`](#flub-generate-bundlestats)
* [`flub generate packageJson`](#flub-generate-packagejson)
* [`flub generate readme`](#flub-generate-readme)
* [`flub generate typetests`](#flub-generate-typetests)

## `flub generate buildVersion`

This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build

```
USAGE
  $ flub generate buildVersion --build <value> [-v] [--testBuild <value>] [--release release|prerelease|none] [--patch
    <value>] [--base <value>] [--tag <value>] [-i <value>]

FLAGS
  -i, --includeInternalVersions=<value>  Include Fluid internal versions.
  -v, --verbose                          Verbose logging.
  --base=<value>                         The base version. This will be read from lerna.json/package.json if not
                                         provided.
  --build=<value>                        (required) The CI build number.
  --patch=<value>                        Indicates the build is a patch build.
  --release=<option>                     Indicates the build is a release build.
                                         <options: release|prerelease|none>
  --tag=<value>                          The tag name to use.
  --testBuild=<value>                    Indicates the build is a test build.

DESCRIPTION
  This command is used to compute the version number of Fluid packages. The release version number is based on what's in
  the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease
  suffix if it is not a tagged build

EXAMPLES
  $ flub generate buildVersion
```

## `flub generate bundleStats`

Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption

```
USAGE
  $ flub generate bundleStats [-v] [--smallestAssetSize <value>]

FLAGS
  -v, --verbose                Verbose logging.
  --smallestAssetSize=<value>  [default: 100] The smallest asset size in bytes to consider correct. Adjust when testing
                               for assets that are smaller.

DESCRIPTION
  Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later
  consumption
```

## `flub generate packageJson`

Generate mono repo package json

```
USAGE
  $ flub generate packageJson -g client|server|azure|build-tools [-v]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of the release group
                               <options: client|server|azure|build-tools>
  -v, --verbose                Verbose logging.

DESCRIPTION
  Generate mono repo package json
```

## `flub generate readme`

Adds commands to README.md in current directory.

```
USAGE
  $ flub generate readme --dir <value> [--multi] [--aliases]

FLAGS
  --[no-]aliases  include aliases in the command list
  --dir=<value>   (required) [default: docs] output directory for multi docs
  --multi         create a different markdown page for each topic

DESCRIPTION
  Adds commands to README.md in current directory.

  The readme must have any of the following tags inside of it for it to be replaced or else it will do nothing:

  # Usage

  <!-- usage -->

  # Commands

  <!-- commands -->

  # Table of contents

  <!-- toc -->

  Customize the code URL prefix by setting oclif.repositoryPrefix in package.json.
```

## `flub generate typetests`

Generates type tests based on the individual package settings in package.json.

```
USAGE
  $ flub generate typetests [-v] [-d <value> | --packages | -g client|server|azure|build-tools] [--prepare | --generate]
    [--reset | ] [-b <value> | -s ^previousMajor|^previousMinor|~previousMajor|~previousMinor|previousMajor|previousMino
    r|previousPatch|baseMinor|baseMajor|~baseMinor] [--exact <value> |  | ] [--pin] [--generateInName]

FLAGS
  -b, --branch=<value>
      Use the specified branch name to determine the version constraint to use for previous versions, rather than using
      the current branch name.

      The version constraint used will still be loaded from branch configuration; this flag only controls which branch's
      settings are used.

  -d, --dir=<value>
      Run on the package in this directory. Cannot be used with --releaseGroup or --packages.

  -g, --releaseGroup=<option>
      Run on all packages within this release group. Cannot be used with --dir or --packages.
      <options: client|server|azure|build-tools>

  -s, --versionConstraint=<option>
      The type of version constraint to use for previous versions. This overrides the branch-specific configuration in
      package.json, which is used by default.

      For more information about the options, see https://github.com/microsoft/FluidFramework/blob/main/build-tools/packag
      es/build-cli/docs/typetestDetails.md#configuring-a-branch-for-a-specific-baseline

      Cannot be used with --dir or --packages.

      <options: ^previousMajor|^previousMinor|~previousMajor|~previousMinor|previousMajor|previousMinor|previousPatch|base
      Minor|baseMajor|~baseMinor>

  -v, --verbose
      Verbose logging.

  --exact=<value>
      An exact string to use as the previous version constraint. The string will be used as-is. Only applies to the
      prepare phase.

  --generate
      Generates tests only. Doesn't prepare the package.json.

  --[no-]generateInName
      Includes .generated in the generated type test filenames.

  --packages
      Run on all independent packages in the repo. This is an alternative to using the --dir flag for independent
      packages.

  --pin
      Searches the release git tags in the repo and selects the baseline version as the maximum
      released version that matches the range.

      This effectively pins the version to a specific version while allowing it to be updated manually as
      needed by running type test preparation again.

  --prepare
      Prepares the package.json only. Doesn't generate tests. Note that npm install may need to be run after preparation.

  --reset
      Resets the broken type test settings in package.json. Only applies to the prepare phase.

DESCRIPTION
  Generates type tests based on the individual package settings in package.json.

  Generating type tests has two parts: preparing package.json and generating test modules. By default, both steps are
  run for each package. You can run only one part at a time using the --prepare and --generate flags.

  Preparing package.json determines the baseline previous version to use, then sets that version in package.json. If the
  previous version changes after running preparation, then npm install must be run before the generate step will run
  correctly.

  Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during
  preparation. This is useful when resetting the type tests to a clean state, such as after a major release.

  Generating test modules takes the type test information from package.json, most notably any known broken type tests,
  and generates test files that should be committed.

  To learn more about how to configure type tests, see the detailed documentation at
  <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.

EXAMPLES
  Prepare the package.json for all packages in the client release group.

    $ flub generate typetests --prepare -g client

  Reset all broken type tests across the client release group.

    $ flub generate typetests --prepare -g client --reset

  Pin the type tests to the previous major version.

    $ flub generate typetests --prepare -s previousMajor

  Pin the type tests to the current base major version.

    $ flub generate typetests --prepare -s baseMajor

  Regenerate type tests for the client release group.

    $ flub generate typetests --generate -g client
```
