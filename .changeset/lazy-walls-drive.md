---
"@fluidframework/azure-client": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/devtools": minor
"@fluidframework/driver-base": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/file-driver": minor
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/replay-driver": minor
"@fluidframework/runtime-definitions": minor
"@fluid-private/test-loader-utils": minor
"@fluidframework/test-runtime-utils": minor
---

Stricter typing on `submitSignal` content

Update `content` typing on submitSignal from `any` to `unknown` or `string` (after unknown has been JSON.stringified)
