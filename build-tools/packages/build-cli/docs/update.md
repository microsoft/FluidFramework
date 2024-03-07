`flub update`
=============

Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)

* [`flub update fluid-imports`](#flub-update-fluid-imports)

## `flub update fluid-imports`

Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)

```
USAGE
  $ flub update fluid-imports [-v | --quiet] [--onlyInternal]

FLAGS
  --onlyInternal  Use /internal for all non-public APIs instead of /alpha or /beta.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

DESCRIPTION
  Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)
```

_See code: [src/commands/update/fluid-imports.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/update/fluid-imports.ts)_
