# API-Extractor

Fluid Framework uses [API-Extractor](https://api-extractor.com/) to validate package API surfaces, generate API reports for code review, and produce the API models consumed by our API documentation tooling.

## Configuration

See the [`@fluidframework/build-common` README](../../../common/build/build-common/README.md#api-extractor-configuration) for the shared configuration hierarchy, package setup patterns, and known limitations.

## Working with API-Extractor

The package-level `build:api-reports` task regenerates committed `*.api.md` review files after `build:esnext` produces declarations.
CI runs the corresponding `ci:build:api-reports` task and fails when committed reports are out of date.
Packages with "current" and "legacy" surfaces run child tasks for each generated entrypoint.

See [API Reports and Review](../Contributing/API-Reports-and-Review.md) for the report review workflow.
See [Maintaining API Support Levels](../Contributing/Maintaining-API-Support-Levels.md) for package exports, generated release-level entrypoints, and policy automation.
See [TSDoc Guidelines](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md) and [Release Tags](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md) for API documentation guidance.
