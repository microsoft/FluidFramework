---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/driver-utils": minor
"fluid-framework": minor
"@fluidframework/odsp-doclib-utils": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"@fluidframework/routerlicious-driver": minor
"@fluidframework/telemetry-utils": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/tinylicious-client": minor
---

Deprecated error-related enums have been removed

Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
`DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
on the replacements.
