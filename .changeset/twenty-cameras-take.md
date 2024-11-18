---
"@fluidframework/presence": minor
---
---
"section": other
---

Presence package updates

#### Package scope advanced from `@fluid-experimental` ([#23073](https://github.com/microsoft/FluidFramework/pull/23073))

To update existing:
- package.json: replace `@fluid-experimental/presence` with `@fluidframework/presence`
- code imports: replace `@fluid-experimental/presence` with `@fluidframework/presence/alpha`

#### The methods and properties of `PresenceStates` have been reorganized ([#23021](https://github.com/microsoft/FluidFramework/pull/23021))

The `PresenceStatesEntries` object, which represents each of the states in the `PresenceStates` schema, has been moved from directly within `PresenceStates` to under property names `props`. Only the `add` method remains directly within `PresenceStates`. The type `PresenceStatesMethods` has also been removed since it is no longer used.

To update existing code, access your presence states from the `props` property instead of directly on the `PresenceStates` object. For example:
```patch
- presenceStatesWorkspace.myMap.local.get("key1");
+ presenceStatesWorkspace.props.myMap.local.get("key1");
```

#### `BroadcastControls` replace `LatestValueControls` ([#23120](https://github.com/microsoft/FluidFramework/pull/23120))

`BroadcastControls` maybe specified on `PresenceStates` thru new `controls` property as defaults for all value managers.

`allowableUpdateLatencyMs` was renamed from `allowableUpdateLatency` to clarify units are milliseconds. Specifying this value currently has no effect, but use is recommended to light up as implementation comes online.

Unsupported `forcedRefreshInterval` has been removed until implementation is closer.
