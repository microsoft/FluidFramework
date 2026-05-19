---
"@fluidframework/fluid-runner": minor
"__section": other
---
Expose `createFluidRunnerContainerAndExecute` and `createFluidRunnerLogger` as `@legacy @beta`

The lower-level helpers `createFluidRunnerContainerAndExecute` and `createFluidRunnerLogger` from `@fluidframework/fluid-runner` are now part of the legacy/beta public API surface. Use `createFluidRunnerContainerAndExecute` to load a container from an ODSP snapshot and run caller-provided code against it. Use `createFluidRunnerLogger` to obtain a file-backed telemetry logger that can be passed to `createFluidRunnerContainerAndExecute`.

The `IFileLogger` and `IFileLoggerTelemetryOptions` types — already exported from the package — have likewise been promoted from `@internal` to `@legacy @beta` so they can be referenced by consumers of these APIs. The signatures of `createFluidRunnerLogger` and `createFluidRunnerContainerAndExecute` use the public `ITelemetryBaseLogger` type from `@fluidframework/core-interfaces`.
