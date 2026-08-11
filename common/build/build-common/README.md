# @fluidframework/build-common

This package contains common build configurations that are applicable to all the packages in the Fluid Framework repo.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on Fluid Framework and packages within.

## API-Extractor Configuration

This package exports several base configurations for use with [API-Extractor](https://api-extractor.com/).
It can be extended in your package's local configuration file like the following:

```json
"extends": "@fluidframework/build-common/api-extractor-<task set>.(cjs|esm).<export set>.json",
```

Chose `cjs` or `esm` based on primary or only output.

### API Task Set

| Set Name | report | model | lint | Description                                                 |
| -------- | ------ | ----- | ---- | ----------------------------------------------------------- |
| report   | ✔️     |       |      | generates `*.api.md` report files and `tsdoc-metadata.json` |
| model    |        | ✔️    |      | generates `_api-extractor-temp/doc-models/*.api.json`       |
| lint     |        |       | ✔️   | performs api-extractor linting                              |
| base     | ✔️     | ✔️    |      | combined report and model                                   |

### Export Set

| Set Name  | ESM | CJS | Description                   |
| --------- | --- | --- | ----------------------------- |
| no-legacy | ✔️  | ✔️  | package has no /legacy export |
| current   | ✔️  |     | reports non-/legacy APIs      |
| legacy    | ✔️  |     | reports /legacy APIs          |

## TypeScript Configurations (`tsconfig.json`)

This package includes several TypeScript project (tsconfig) files that are contain the common configurations used within
the Fluid Framework repo. These configs are designed to be used together using [TypeScript's support for extending
multiple config
files](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#supporting-multiple-configuration-files-in-extends).

-   tsconfig.base.json - This base config contains defaults that all packages within the repo should use as a baseline.
-   tsconfig.node16.json - This config extends base and sets `module: Node16` and `moduleResolution: Node16`. It is intended for all
    builds.
-   tsconfig.test.node16.json - This config disables some settings that we don't want to use in test code, like `declaration` and
    `decarationMap`. It also enables the `node` types by default, and turns on the "allow-ff-test-exports" [condition](https://nodejs.org/api/packages.html#conditional-exports), which allows imports for test-only indexes used in a few packages.

### Dual Build Pattern

Proper ESM build with full validation via Typescript compiler requires Node16 or NodeNext module and `"type": "module"` in package.json. To get a same package CommonJS build, a second tsconfig file should be create with a different `outDir` and `fluid-tsc` should be used for the build in place of `tsc`. Example:

```shell
fluid-tsc commonjs --project ./tsconfig.cjs.json
```

Then an additional `package.json` should be injected into the `outDir` so that references understand those `.js` files are CommonJs. `common/build/build-common/src/cjs/package.json` can be copied for this purpose. Example:

```shell
copyfiles -f ../../../common/build/build-common/src/cjs/package.json ./dist
```

#### Recommended Secondary Project Files

tsconfig.cjs.json:

```json
{
	// This config must be used in a "type": "commonjs" environment. (Use `fluid-tsc commonjs`.)
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"outDir": "./dist"
	}
}
```

src/test/tsconfig.cjs.json:

```json
{
	// This config must be used in a "type": "commonjs" environment. (Use `fluid-tsc commonjs`.)
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"outDir": "../../dist/test"
	},
	"references": [
		{
			"path": "../../tsconfig.cjs.json"
		}
	]
}
```

### Legacy tsconfig

This package also contains a legacy base tsconfig, `ts-common-config.json`. This config is still used in some places
within the repo but is considered deprecated.
