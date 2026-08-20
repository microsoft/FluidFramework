# @fluidframework/build-common

This package contains common build configurations that are applicable to all the packages in the Fluid Framework repo.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on Fluid Framework and packages within.

## API-Extractor Configuration

This package provides the shared [API-Extractor](https://api-extractor.com/) configurations used throughout the Fluid Framework repository.
Package-level configurations should keep report generation, API model generation, and linting separate so each run has one clear purpose.

### Configuration hierarchy

| Configuration                           | Purpose                                                                                                                                                 | Entrypoint behavior                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `api-extractor-report-base.esm.json`    | Enables API reports and TSDoc metadata, applies report-specific diagnostics, and bundles Fluid dependencies so re-exported APIs appear in review files. | Requires a derived configuration to select an entrypoint.                                                   |
| `api-extractor-report.esm.current.json` | Configures public and beta reports for the current, non-legacy API surface.                                                                             | Uses a sentinel value so every package must explicitly select its broadest generated current entrypoint.    |
| `api-extractor-report.esm.legacy.json`  | Configures public and beta reports for the `./legacy` API surface.                                                                                      | Defaults to `lib/legacy.d.ts`; packages override it only when their legacy entrypoint has a different name. |
| `api-extractor-model.esm.json`          | Generates the complete API model consumed by the API documentation toolchain. Report generation and TSDoc metadata are disabled.                        | Defaults to `lib/index.d.ts`; packages override it when their complete model has a different entrypoint.    |
| `api-extractor-lint.json`               | Validates release-tag compatibility across bundled Fluid dependencies without producing outputs.                                                        | Requires a derived configuration to select an entrypoint.                                                   |
| `api-extractor-lint.entrypoint.json`    | Validates a specific generated package entrypoint without producing outputs.                                                                            | Requires a package-level configuration to select an entrypoint.                                             |
| `api-extractor-lint.esm.primary.json`   | Runs cross-package linting against the primary ESM declarations.                                                                                        | Uses `lib/index.d.ts`.                                                                                      |
| `api-extractor-lint.cjs.primary.json`   | Runs cross-package linting against the primary CommonJS declarations.                                                                                   | Uses `dist/index.d.ts`.                                                                                     |

### Package-level report and model configurations

Packages without a `./legacy` export generally define:

-   `api-extractor/api-extractor-report.json`, extending `api-extractor-report-base.esm.json` and explicitly selecting the declaration file that represents the package's reviewed API surface.
-   `api-extractor/api-extractor-model.json`, extending `api-extractor-model.esm.json` to generate the complete documentation model.

Packages with a `./legacy` export generally define:

-   `api-extractor/api-extractor-report.current.json`, extending `api-extractor-report.esm.current.json` and explicitly selecting the broadest generated current entrypoint: `alpha.d.ts`, then `beta.d.ts`, then `public.d.ts`.
-   `api-extractor/api-extractor-report.legacy.json`, extending `api-extractor-report.esm.legacy.json` for the legacy surface.
-   `api-extractor/api-extractor-model.json`, extending `api-extractor-model.esm.json` for the complete API model.

Reports and models intentionally use separate configurations.
Reports are generated for individual release levels and bundle local dependencies so cross-package re-exports can be reviewed.
Models retain the complete symbol graph and stricter link validation needed to generate API reference documentation.

### Known limitation: bundled dependency export aliases

When an API from a package listed in `bundledPackages` is exported under an alias, API-Extractor can use the source declaration's original name instead of its public exported name when another package references it.
The original name is not part of the dependency's public API, so API-Extractor emits an incorrect reference and an `ae-forgotten-export` warning.
This can affect generated API reports, API models, and declaration rollups.

For example, `@fluidframework/core-interfaces` defines a namespace named `InternalUtilityTypes` and exports it as `InternalCoreInterfacesUtilityTypes`:

```typescript
export type { InternalUtilityTypes as InternalCoreInterfacesUtilityTypes } from "./exposedInternalUtilityTypes.js";
```

Other Fluid packages correctly import and reference the public name:

```typescript
import type { InternalCoreInterfacesUtilityTypes } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

export type Example<T> = InternalCoreInterfacesUtilityTypes.IfSameType<T, string>;
```

When the dependency is bundled, API-Extractor can instead use the source declaration's original name in the consuming package's output:

```typescript
export type Example<T> = InternalUtilityTypes.IfSameType<T, string>;
```

Explicitly re-exporting the dependency API from the consuming package can avoid the issue, but that workaround changes the consumer's exported surface.
Removing the dependency from `bundledPackages` also avoids the incorrect reference, but omits the dependency's re-exported API from review.

See [Rushstack issue #5920](https://github.com/microsoft/rushstack/issues/5920) for the upstream bug and [minimal reproduction](https://github.com/Josmithr/api-extractor-playground/tree/bundledPackages-reexport-aliased).

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
