---
"@fluidframework/server-routerlicious-base": major
---

Fix Signal Notifications API replacing `TypedEventEmitter` with `@socket.io/redis-emitter`.

Some breaking changes were introduced by replacing `TypedEventEmitter` with `@socket.io/redis-emitter` (`RedisEmitter`). All of the changes modfify the signature of existing functions, used to create Alfred instances. The type of `collaborationSessionEventEmitter` was changed from `TypedEventEmitter` to `RedisEmitter`.

Here is a list of the changes:

- Modified type `collaborationSessionEventEmitter` from `TypedEventEmitter` to `RedisEmitter` in Alfred. This parameter was modified in the following functions:
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/app.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/api.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/index.ts`
  - `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/index.ts`
  - `AlfredRunner` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runner.ts`
  - `AlfredResources` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runnerFactory.ts`
