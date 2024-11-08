---
"@fluidframework/presence": minor
---
---
"section": other
---

Presence package updates

#### The methods and properties of `PresenceStates` have been reorganized ([#23021](https://github.com/microsoft/FluidFramework/pull/23021))

The `PresenceStatesEntries` object, which represents each of the states in the `PresenceStates` schema, has been moved from directly within `PresenceStates` to under property names `props`. Only the `add` method remains directly within `PresenceStates`. The type `PresenceStatesMethods` has also been removed since it is no longer used.

To update existing code, access your presence states from the `props` property instead of directly on the `PresenceStates` object. For example:
```patch
- presenceStatesWorkspace.myMap.local.get("key1");
+ presenceStatesWorkspace.props.myMap.local.get("key1");
```
