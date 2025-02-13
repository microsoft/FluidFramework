---
"@fluidframework/server-routerlicious-base": major
---

Migrate Signal Notifications API from Alfred to Nexus

With the migration of the signal notifications API from Alfred to Nexus, different breaking changes were introduced the code. All of them are changing the signature of existing functions, used to create Alfred and Nexus instances. In the case of Alfred, the `collaborationSessionEventEmitter` was completely removed as well as the endpoint used to broadcast signals. In the case of Nexus, new parameters were added to the create function and a new HTTP API was introduced, to manage HTTP request that require the use of sockets after receiving the request.

Here is a list of the changes:

- Removed `collaborationSessionEventEmitter` from Alfred. This parameter was removed from the following functions:
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/app.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/api.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/index.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/index.ts`
  - `AlfredRunner` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runner.ts`
  - `AlfredResources` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runnerFactory.ts`

- Added and rearranged parameter order in the Nexus `create` function:
  - `create` in `server/routerlicious/packages/routerlicious-base/src/nexus/app.ts`
    - Added `tenantManager`, `restThrottlers`, and `storage` as required parameters.
    - Added `collaborationSessionEventEmitter` an optional parameter.

- Added `nexusRestThrottleIdSuffix` to the `Constants` object in `server/routerlicious/packages/routerlicious-base/src/utils/constants.ts`.
