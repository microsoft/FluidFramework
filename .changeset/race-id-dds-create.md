---
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"__section": feature
---
Race-id DDS create: deterministic FWW resolution for concurrent channel creates

Adds an opt-in alpha API for resolving racing DDS creates with deterministic first-writer-wins (FWW) semantics. When multiple clients independently create a channel that they consider semantically the same (for example, a singleton DDS attached to a shared key), all clients converge to the same winner without breaking optimistic local application.

API surface (alpha):
- `IFluidDataStoreRuntime.createChannel(raceId, type, { onLost })` overload — pass a shared `raceId` agreed across racing clients; the runtime mints a unique internal channel id (`${raceId}#${guid}`).
- `IAttachMessage.raceId` — optional field that propagates the race id with the attach op.
- `raceResolved` event on `IFluidDataStoreRuntime` — fires with `{ raceId, winnerChannelId, loserChannelIds }`.
- `OnRaceLost` callback — invoked on losing clients so the app can merge local edits from the loser channel into the winner.

Resolution semantics: the first attach op for a given `raceId` (per the sequenced order) wins. Subsequent attaches with the same `raceId`, and any channel ops addressed to loser channel ids, are dropped on every client deterministically. Loser->winner redirects are persisted in a `.races` summary blob.

v1 limitations (tracked as follow-ups):
- Race-id handles, optimistic handle storage, data-store-level races, public `IChannel.dispose()`, and async `onLost` are out of scope.
- The summary redirect table is rehydrated asynchronously on load; ops to historical losers may transiently be applied during the load window.

Detached-state and staging-mode support:
- **Detached / locally-visible**: `createChannel(raceId, …)` records the channel locally. When the data store becomes globally visible, the channel is embedded in the attach summary alongside a `.races` blob that records it as the resolved winner for `raceId` from this client's perspective. Peers loading the summary register the resolution; subsequent attach ops with the same `raceId` are treated as losers and their channel ops are dropped via `loserToWinner`. The `raceResolved` event is deferred until the data store becomes globally visible.
- **Staging mode**: `createChannel(raceId, …)` records the channel in a `staged` state; the attach op is buffered by the `PendingStateManager`. On `commitChanges` the attach flows through normal submit and the standard inbound resolver applies. On `discardChanges` (via `rollback`) the staged race entry and channel context are removed and the `raceId` becomes reusable. The overload is rejected only if the data store's `readonlyInStagingMode` policy is set.
- Attempting `createChannel(raceId, …)` for a `raceId` already known to be resolved on this client throws `UsageError`; the caller should obtain the winner via `getChannel`.
