`flub modify`
=============

Modify commands are used to modify projects to add or remove dependencies, update Fluid imports, etc.

* [`flub modify fluid-imports`](#flub-modify-fluid-imports)

## `flub modify fluid-imports`

Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)

```
USAGE
  $ flub modify fluid-imports [-v | --quiet] [--tsconfigs <value>] [--packageRegex <value>] [--data <value>]
    [--onlyInternal]

FLAGS
  --data=<value>          Optional path to a data file containing raw API level data. Overrides API levels extracted
                          from package data.
  --onlyInternal          Use /internal for all non-public APIs instead of /alpha or /beta.
  --packageRegex=<value>  Regular expression filtering import packages to adjust
  --tsconfigs=<value>...  [default: ./tsconfig.json] Tsconfig file paths that will be used to load project files. When
                          multiple are given all must depend on the same version of packages; otherwise results are
                          unstable.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)
```

_See code: [src/commands/modify/fluid-imports.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/modify/fluid-imports.ts)_
