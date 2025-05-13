`flub promote`
==============

Promote commands are used to promote packages published to an npm registry.

* [`flub promote package`](#flub-promote-package)

## `flub promote package`

Promotes a package to the Release view in Azure DevOps Artifacts.

```
USAGE
  $ flub promote package --version <value> --orderFile <value> --token <value> [-v | --quiet]

FLAGS
  --orderFile=<value>  (required) A file with package names that should be promoted. Such files can be created using
                       `flub list`.
  --token=<value>      (required) Azure DevOps access token. This parameter should be passed using the ADO_API_TOKEN
                       environment variable for security purposes.
  --version=<value>    (required) Version of the package to promote.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Promotes a package to the Release view in Azure DevOps Artifacts.

  Used to promote a package to the Release view if it's a release build and in the build feed.  THIS COMMAND IS INTENDED
  FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.
```

_See code: [src/commands/promote/package.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/promote/package.ts)_
