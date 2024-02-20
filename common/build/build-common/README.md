# @fluidframework/build-common

This package contains common build configurations that are applicable to all the packages in the Fluid Framework repo.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on Fluid Framework and packages within.

## API-Extractor Configuration

This package exports a base configuration for use with [API-Extractor](https://api-extractor.com/).
It can be extended in your package's local configuration file like the following:

```json
"extends": "@fluidframework/build-common/api-extractor-base.json",
```

### Dual Build Considerations

A variety of configuration files were build and named while dual build pattern was being developed and have not been rationalized for what is believed to be the final state. The import aspect is to select a set of files that generate the report once. With the current dual build pattern this means using both of the `api-extractor-base.(cjs|esm).primary.json` files and then configuration override of:

```json
	"apiReport": {
		"enabled": false
	}
```

preferrably for the CommonJS case.

### Legacy Configurations

This package previously exported a series of configurations with differing levels of validation.
These configurations are now deprecated and have been replaced with the configuration noted above.

## TypeScript Configurations (`tsconfig.json`)

This package includes several TypeScript project (tsconfig) files that are contain the common configurations used within
the Fluid Framework repo. These configs are designed to be used together using [TypeScript's support for extending
multiple config
files](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#supporting-multiple-configuration-files-in-extends).

-   tsconfig.base.json - This base config contains defaults that all packages within the repo should use as a baseline.
-   tsconfig.node16.json - This config extends base and sets `module: Node16` and `moduleResolution: Node16`. It is intended for all
    builds.
-   tsconfig.test.node16.json - This config disables some settings that we don't want to use in test code, like `declaration` and
    `decarationMap`. It also enables the `node` types by default.

### Legacy tsconfig

This package also contains a legacy base tsconfig, `ts-common-config.json`. This config is still used in some places
within the repo but is considered deprecated.

And there are a handful of tsconfigs that we thought we'd want but no longer think they have common purpose:
`tsconfig.cjs.json`, `tsconfig.esm.json`, `tsconfig.esm-only.json`, and `tsconfig.test.json`

## Tsc-Multi Configurations (`tsc-multi.*.json`)

This package includes several Tsc-Multi config files that are contain the common configurations used within
the Fluid Framework repo. These configs are designed to be used to dual build packages for CommonJS and ESM.

-   tsc-multi.type-commonjs.json - basic specification that overrides tsc view of current directory package.json "type" to be "commonjs". To be used in conjunction with a tsc project file, which specifies `"module": "Nodes16"`, on command line.
-   tsc-multi.type-module.json - basic specification that overrides tsc view of current directory package.json "type" to be "module". To be used in conjunction with a tsc project file, which specifies `"module": "Nodes16"`, on command line.
-   tsc-multi.node16.cjs.json - complete specification with package `"type": "commonjs"` override, tsc `"outDir": "dist"` override, and reference to `tsconfig.json` project, which is expected to specify `"module": "Nodes16"`. If also testing both CommonJs and ESM, prefer using `tsc-multi.type-commonjs.json` and a local tsconfig.cjs.json with `outDir` override for both product and test builds. (The test tsconfig.cjs.json will need `references` to the product tsconfig.cjs.json.)

### Legacy tsc-multi.\*.json

Several Tsc-Multi config files remain that use a deprecated style of dual build that emit modified .js extensions. As extension modification means rewriting files the likelihood of error is signficant and this has been superceded by package type override pattern. Configurations that should be replaced:
`tsc-multi.cjs.json`, `tsc-multi.esm.json`
