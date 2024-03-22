`flub modify`
=============

Modify commands are used to modify projects to add or remove dependencies, update Fluid imports, etc.

* [`flub modify fluid-imports`](#flub-modify-fluid-imports)

## `flub modify fluid-imports`

Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)

```
USAGE
  $ flub modify fluid-imports [-v | --quiet] [--tsconfig <value>] [--data <value>] [--organize] [--onlyInternal]

FLAGS
  --data=<value>      Path to a data file containing raw API level data.
  --onlyInternal      Use /internal for all non-public APIs instead of /alpha or /beta.
  --organize          Organize the imports in any file that is modified. Note that this can make it more difficult to
                      see the rewritten import changes.
  --tsconfig=<value>  [default: ./tsconfig.json] Path to a tsconfig file that will be used to load project files.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

DESCRIPTION
  Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)
```

_See code: [src/commands/modify/fluid-imports.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/modify/fluid-imports.ts)_
