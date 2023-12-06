---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
"@fluidframework/datastore": major
"@fluidframework/driver-definitions": major
"@fluidframework/driver-utils": major
"fluid-framework": major
"@fluidframework/odsp-doclib-utils": major
"@fluidframework/odsp-driver": major
"@fluidframework/odsp-driver-definitions": major
"@fluidframework/routerlicious-driver": major
"@fluidframework/telemetry-utils": major
"@fluid-private/test-end-to-end-tests": major
"@fluidframework/tinylicious-client": major
---

Deprecate a number of error related enums, and replace them with new object-based based enumerations.

The changes involve deprecation of error related enums ContainerErrorType, DriverErrorType, OdspErrorType and RouterliciousErrorType and replacement to new object-based enumerations of ContainerErrorTypes, DriverErrorTypes, OdspErrorTypes and RouterliciousErrorTypes. In addition, it adds a stricter type checking logic to the test suites on the changed error enumerations.
