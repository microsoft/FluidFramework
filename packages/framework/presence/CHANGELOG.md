# @fluid-experimental/presence

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

### Minor Changes

-   Presence updates are now grouped and throttled ([#23075](https://github.com/microsoft/FluidFramework/pull/23075)) [abde76d8de](https://github.com/microsoft/FluidFramework/commit/abde76d8decbaf2cde8aac68b3fa061a0fe75d92)

    Presence updates are grouped together and throttled to prevent flooding the network with messages when presence values are rapidly updated. This means the presence infrastructure will not immediately broadcast updates but will broadcast them after a configurable delay.

    The `allowableUpdateLatencyMs` property configures how long a local update may be delayed under normal circumstances,
    enabling grouping with other updates. The default `allowableUpdateLatencyMs` is **60 milliseconds** but may be (1)
    specified during configuration of a [States
    Workspace](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#states-workspace)
    or [Value
    Manager](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#value-managers)
    and/or (2) updated later using the `controls` member of a Workspace or Value Manager. The [States
    Workspace](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#states-workspace)
    configuration applies when a Value Manager does not have its own setting.

    Notifications are never queued; they effectively always have an `allowableUpdateLatencyMs` of 0. However, they may be grouped with other updates that were already queued.

    Note that due to throttling, clients receiving updates may not see updates for all values set by another. For example,
    with `Latest*ValueManagers`, the only value sent is the value at the time the outgoing grouped message is sent. Previous
    values set by the client will not be broadcast or seen by other clients.

    #### Example

    You can configure the grouping and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

    ```ts
    // Create and configure a states workspace
    const stateWorkspace = presence.getStates(
    	"app:v1states",
    	{
    		// This value manager has an allowable latency of 100ms.
    		position: Latest({ x: 0, y: 0 }, { allowableUpdateLatencyMs: 100 }),
    		// This value manager uses the workspace default allowable latency of 60ms.
    		count: Latest({ num: 0 }),
    	},
    	// Set the default allowable latency for all value managers in this workspace to 200ms,
    	// overriding the default value of 60ms.
    	{ allowableUpdateLatencyMs: 200 },
    );

    // Temporarily set count updates to send as soon as possible.
    const countState = stateWorkspace.props.count;
    countState.controls.allowableUpdateLatencyMs = 0;
    countState.local = { num: 5000 };

    // Reset the update latency to the workspace default of 60ms.
    countState.controls.allowableUpdateLatencyMs = undefined;
    ```

-   Presence-related events now support the `off` event deregistration pattern ([#23196](https://github.com/microsoft/FluidFramework/pull/23196)) [f7be9651da](https://github.com/microsoft/FluidFramework/commit/f7be9651daeba09853627c0953e5969a60674ce3)

    Event subscriptions within `@fluidframework/presence` may now use `off` to deregister event listeners, including initial listeners provided to `Notifications`.

    Some type names have shifted within the API though no consumers are expected to be using those types directly. The most visible rename is `NotificationSubscribable` to `NotificationListenable`. Other shifts are to use types now exported through `@fluidframework/core-interfaces` where the most notable is `ISubscribable` that is now `Listenable`.

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
