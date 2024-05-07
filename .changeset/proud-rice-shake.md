---
"@fluidframework/azure-client": minor
"@fluidframework/azure-end-to-end-tests": minor
"@fluid-experimental/azure-scenario-runner": minor
"fluid-framework": minor
"@fluidframework/fluid-static": minor
"@fluid-experimental/odsp-client": minor
"@fluid-experimental/odsp-end-to-end-tests": minor
"@fluidframework/tinylicious-client": minor
---

Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id`

1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client. 
2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR. 
