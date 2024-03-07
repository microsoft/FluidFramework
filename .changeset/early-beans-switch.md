---
"@fluidframework/driver-utils": minor
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-urlresolver": minor
"@fluid-experimental/property-dds": minor
"@fluidframework/routerlicious-driver": minor
"@fluidframework/routerlicious-urlresolver": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-utils": minor
"@fluidframework/tinylicious-driver": minor
---

Resolved URLs no longer use non-standard protocols

Previously, IResolvedUrl.url could use a non-standard protocol like fluid://, fluid-odsp://, or fluid-test://. These have been replaced with https:// to permit standards-compliant URL parsing.
