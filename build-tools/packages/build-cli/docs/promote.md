`flub promote`
==============

Promotes a package to the Release view in Azure DevOps Artifacts.

* [`flub promote package`](#flub-promote-package)

## `flub promote package`

Promotes a package to the Release view in Azure DevOps Artifacts.

```
USAGE
  $ flub promote package --version <value> --orderFile <value> --token <value> --releaseFlag <value> --feedKind
    <value> [-v | --quiet]

FLAGS
  --feedKind=<value>     (required) ADO feed kind e.g. (internal-build or public)
  --orderFile=<value>    (required) A file with package names that should be published. Such files can be created using
                         `flub list`.
  --releaseFlag=<value>  (required) Release flag e.g. (prerelease or release)
  --token=<value>        (required) Azure DevOps access token
  --version=<value>      (required) Version of the package

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Promotes a package to the Release view in Azure DevOps Artifacts.

  Used to promote a package to the Release view if it's a release build and in the build feed.
```

_See code: [src/commands/promote/package.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/promote/package.ts)_
