# Internal entrypoint source structure for `@fluidframework/telemetry-utils`

Note: index.ts is avoided as the external (see [src/api.ts](#srcapits) and internal (see [src/internal.ts](#srcinternalts) entrypoints are reasonably different.
There is no way in which a single file can act as source for both use cases as there are exports common to both that have different attributes or even definitions.
Even if those conflicts were removed isolating internals provides clarity and offers ability to stage deprecations and refactors cleanly.

## src/main.ts

Barrel file for all of the common externally accessible APIs.

## src/api.ts

Main entry for external access that re-exports main.ts and adds external specific APIs or at least specifically typed versions of APIs.
This is processed for entrypoint generation along public and legacy lines.

## src/internal.ts

Main entry for internal access that re-exports main.ts and all internal only APIs, which mak up the largest part of this package.
This can include non-deprecated versions of externally accessible APIs and/or APIs with internal-only typing.

# Current work

## ITelemetryLoggerExt external deprecation

Internally `TelemetryLoggerExt` maybe used to access internal, extended logger. Externally `ITelemetryLoggerExt` is passed around.
Temporarily, `ITelemetryLoggerExt` imported from `@fluidframework/telemetry-utils/internal` is a type alias to `TelemetryLoggerExt` to reduce internal churn.
All such imports should be replaced with direct `TelemetryLoggerExt` use.
Internally, `extractTelemetryLoggerExt` can be used to get `TelemetryLoggerExt` from `ITelemetryLoggerExt`.
These transitions are already put in place and should be preserved.
Similarly, `toITelemetryLoggerExt` can be used to go the other direction.

The deprecation is tracked by [issue #26910](https://github.com/microsoft/FluidFramework/issues/26910).
