# @fluid-experimental/presence

## 2.5.0

### Minor Changes

-   ISessionClient now exposes connectivity information ([#22973](https://github.com/microsoft/FluidFramework/pull/22973)) [6096657620](https://github.com/microsoft/FluidFramework/commit/609665762050b5f3baf737d752fc87ef962b3a21)

    1. `ISessionClient` has a new method, `getConnectionStatus()`, with two possible states: `Connected` and `Disconnected`.
    2. `ISessionClient`'s `connectionId()` member has been renamed to `getConnectionId()` for consistency.
    3. `IPresence` event `attendeeDisconnected` is now implemented.

## 2.4.0

Dependency updates only.

## 2.3.0

### Major Changes

-   Experimental Presence package added ([#22499](https://github.com/microsoft/FluidFramework/pull/22499)) [42b323cdbf1](https://github.com/microsoft/FluidFramework/commit/42b323cdbf129c897cf9bb51c1f1b9de5642ef8a)

    **[@fluid-experimental/presence](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/presence#readme)** is now available for investigation. The new package is meant to support presence of collaborators connected to the same container. Use this library to quickly share simple, non-persisted data among all clients or send/receive fire and forget notifications.

    API documentation for **@fluid-experimental/presence** is available at <https://fluidframework.com/docs/apis/presence>.

    There are some limitations; see the README.md of installed package for most relevant notes.

    We're just getting started. Please give it a go and share feedback.
