---
"@fluidframework/driver-utils": major
"@fluidframework/local-driver": major
"@fluidframework/odsp-driver": major
"@fluidframework/odsp-urlresolver": major
"@fluid-experimental/property-dds": major
"@fluidframework/routerlicious-driver": major
"@fluidframework/routerlicious-urlresolver": major
"@fluid-private/test-end-to-end-tests": major
"@fluidframework/test-utils": major
"@fluidframework/tinylicious-driver": major
---

Resolved URLs no longer use non-standard protocols

Previously, IResolvedUrl.url could use a non-standard protocol like fluid://, fluid-odsp://, or fluid-test://. These have been replaced with https:// to permit standards-compliant URL parsing.
