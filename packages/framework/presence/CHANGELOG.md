# @fluid-experimental/presence

## 2.10.0

### Minor Changes

-   Presence package updates ([#23021](https://github.com/microsoft/FluidFramework/pull/23021)) [365c5c0643](https://github.com/microsoft/FluidFramework/commit/365c5c06437ea27786385fe1caae8b4ddfbe7480)

    #### Package scope advanced from `@fluid-experimental` ([#23073](https://github.com/microsoft/FluidFramework/pull/23073))

    To update existing:

    -   package.json: replace `@fluid-experimental/presence` with `@fluidframework/presence`
    -   code imports: replace `@fluid-experimental/presence` with `@fluidframework/presence/alpha`

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

## 2.5.0

### Minor Changes

ISessionClient now exposes connectivity information

    1. `ISessionClient` has a new method, `getConnectionStatus()`, with two possible states: `Connected` and `Disconnected`. ([#22833](https://github.com/microsoft/FluidFramework/pull/22833))
    2. `ISessionClient`'s `connectionId()` member has been renamed to `getConnectionId()` for consistency. ([#22973](https://github.com/microsoft/FluidFramework/issues/22973))
    3. `IPresence` event `attendeeDisconnected` is now implemented. ([#22833](https://github.com/microsoft/FluidFramework/pull/22833))

## 2.4.0

Various implementation improvements.

## 2.3.0

### Major Changes

-   Experimental Presence package added ([#22499](https://github.com/microsoft/FluidFramework/pull/22499)) [42b323cdbf1](https://github.com/microsoft/FluidFramework/commit/42b323cdbf129c897cf9bb51c1f1b9de5642ef8a)

    **[@fluid-experimental/presence](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#readme)** is now available for investigation. The new package is meant to support presence of collaborators connected to the same container. Use this library to quickly share simple, non-persisted data among all clients or send/receive fire and forget notifications.

    API documentation for **@fluid-experimental/presence** is available at <https://fluidframework.com/docs/apis/presence>.

    There are some limitations; see the README.md of installed package for most relevant notes.

    We're just getting started. Please give it a go and share feedback.
