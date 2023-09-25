---
"@fluidframework/telemetry-utils": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/runtime-definitions": minor
---

Upcoming: The type of the logger property/param in various APIs will be changing

-   @fluidframework/runtime-definitions
    -   `IFluidDataStoreRuntime.logger` will be re-typed as `ITelemetryBaseLogger`
-   @fluidframework/odsp-driver
    -   `protected OdspDocumentServiceFactoryCore.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`
    -   `protected LocalOdspDocumentServiceFactory.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`

Additionally, several of @fluidframework/telemetry-utils's exports are being marked as internal and should not be consumed outside of other FF packages.
