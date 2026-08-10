# API-Extractor

Fluid Framework uses [API-Extractor](https://api-extractor.com/) to validate package API surfaces, generate API reports for code review, and produce the API models consumed by our API documentation tooling.

## Configuration

Most packages keep their API-Extractor configuration in an `api-extractor` directory and extend shared configuration from [`common/build/build-common`](../../../common/build/build-common/).
The shared configuration is layered so common validation rules and package-specific output concerns stay separate:

- [`api-extractor-base.json`](../../../common/build/build-common/api-extractor-base.json) defines validation, message reporting, output locations, and other defaults, but leaves all outputs disabled.
- [`api-extractor-base.esm.json`](../../../common/build/build-common/api-extractor-base.esm.json) selects `lib/index.d.ts` as the standard ESM entrypoint and enables TSDoc metadata.
- [`api-extractor-report-base.esm.json`](../../../common/build/build-common/api-extractor-report-base.esm.json) configures API reports and bundles Fluid package dependencies so re-exported APIs appear in review files.
- Package-level model configurations enable API model generation for the complete API surface used by the documentation toolchain.

Packages without a `./legacy` export generally use a `api-extractor-report.json` config file for report generation, and `api-extractor-model.json` config file for model generation.
Packages _with_ a `./legacy` export use separate `.current.json` and `.legacy.json` configurations because the two entrypoints expose different API surfaces.

API reports and API models intentionally use separate configurations.
Reports are generated for individual release levels and bundle local dependencies so cross-package re-exports can be reviewed.
Models retain the complete symbol graph and stricter link validation needed to generate the API reference documentation.

## Working with API-Extractor

The package-level `build:api-reports` task regenerates committed `*.api.md` review files after `build:esnext` produces declarations.
CI runs the corresponding `ci:build:api-reports` task and fails when committed reports are out of date.
Packages with "current" and "legacy" surfaces run child tasks for each generated entrypoint.

See [API Reports and Review](../Contributing/API-Reports-and-Review.md) for the report review workflow.
See [Maintaining API Support Levels](../Contributing/Maintaining-API-Support-Levels.md) for package exports, generated release-level entrypoints, and policy automation.
See [TSDoc Guidelines](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md) and [Release Tags](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md) for API documentation guidance.

## Known issues and limitations

### Bundled dependency export aliases can be lost

When an API from a package listed in `bundledPackages` is exported under an alias, API-Extractor can use the source declaration's original name instead of its public exported name when another package references it.
The original name is not part of the dependency's public API, so API-Extractor emits an incorrect reference and an `ae-forgotten-export` warning.
This can affect generated API reports, API models, and declaration rollups.

For example, `@fluidframework/core-interfaces` defines a namespace named `InternalUtilityTypes` and exports it as `InternalCoreInterfacesUtilityTypes`.

```typescript
export type { InternalUtilityTypes as InternalCoreInterfacesUtilityTypes } from "./exposedInternalUtilityTypes.js";
```

Other Fluid packages correctly import and reference that public name:

```typescript
import type { InternalCoreInterfacesUtilityTypes } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

export type Example<T> = InternalCoreInterfacesUtilityTypes.IfSameType<T, string>;
```

When the dependency is bundled, API-Extractor can instead use the source declaration's original name in the consuming package's API report:

```typescript
export type Example<T> = InternalUtilityTypes.IfSameType<T, string>;
```

Explicitly re-exporting the dependency API from the consuming package can avoid the issue, but that workaround changes the consumer's exported surface.
Removing the dependency from `bundledPackages` also avoids the incorrect reference, but omits the dependency's re-exported API from review.

See [Rushstack issue #5920](https://github.com/microsoft/rushstack/issues/5920) for the upstream bug and [minimal reproduction](https://github.com/Josmithr/api-extractor-playground/tree/bundledPackages-reexport-aliased).
