---
"@fluidframework/driver-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": feature
---

Add batched point-in-time sequence-number availability checks

`checkSequenceNumberAvailability` determines whether resolved sequence numbers can currently be
materialized as historical containers without instantiating a container for each target. Results
distinguish verified availability, authoritative retention or bridging failures, and inconclusive
conditions. Callers may mark only `unavailable` results as unresolvable; `unknown` results must remain
resolved and may be retried.

ODSP supports the API through the optional `checkSequenceNumberAvailability` implementation
exported from its point-in-time entry point.
