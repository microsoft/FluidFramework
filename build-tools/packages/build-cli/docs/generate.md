`flub generate`
===============

Generate commands are used to create/update code, docs, readmes, etc.

* [`flub generate buildVersion`](#flub-generate-buildversion)
* [`flub generate bundleStats`](#flub-generate-bundlestats)
* [`flub generate packageJson`](#flub-generate-packagejson)

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
  $ flub generate packageJson -g client|server|azure|build-tools|gitrest|historian [-v]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of the release group
                               <options: client|server|azure|build-tools|gitrest|historian>
  -v, --verbose                Verbose logging.

DESCRIPTION
  Generate mono repo package json
```
