# @fluidframework/build-common

This package contains common build configurations that are applicable to all the packages in the Fluid Framework repo.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on Fluid Framework and packages within.

## API-Extractor Configuration

This package exports a base configuration for use with [API-Extractor](https://api-extractor.com/).
It can be extended in your package's local configuration file like the following:

```json
"extends": "@fluidframework/build-common/api-extractor-base.json",
```

### Legacy Configurations

This package previously exported a series of configurations with differing levels of validation.
These configurations are now deprecated and have been replaced with the configuration noted above.

## TypeScript Configurations (`tsconfig.json`)

This package includes several TypeScript config (tsconfig) files that are contain the common configurations used within
the Fluid Framework repo. These configs are designed to be used together using [TypeScript's support for extending
multiple config
files](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#supporting-multiple-configuration-files-in-extends).

-   tsconfig.base.json - This base config contains defaults that all packages within the repo should use as a baseline.
-   tsconfig.cjs.json - This config sets `module: Node16` and `moduleResolution: Node16` and is intended for CommonJS
    builds. This config is intended to be layered on top of the base config.
-   tsconfig.esm.json - This config sets `module: ESNext` and `moduleResolution: Node10` and is intended for ESM builds
    in packages that build both CJS and ESM. This config is intended to be layered on top of the base config. This config
    uses `Node10` module resolution because `Node16` cannot be used to build both CJS and ESM from a common source.
-   tsconfig.esm-only.json - This config sets `module: Node16` and `moduleResolution: Node16` and is intended for
    packages that build _only_ ESM. It should only be used in ESM-only packages, and it assumes the `type` field in
    package.json is set to `"module"`. This config is intended to be layered on top of the base config. Note that while
    this config is currently the same as tsconfig.cjs.json, that may not always be true, and having "tsm-only" in the
    name means it won't confuse people why an ESM-only package would be inheriting from the CJS base config.
-   tsconfig.test.json - This config disables some settings that we don't want to use in test code, like `declaration` and
    `decarationMap`. It also enables the `node` types by default.

### Legacy tsconfig

This package also contains a legacy base tsconfig, `ts-common-config.json`. This config is still used in some places
within the repo but is considered deprecated.
