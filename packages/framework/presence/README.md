# @fluidframework/presence

A set of session-focused utilities for lightweight data sharing and messaging.

A session is a period of time when one or more clients are connected to a Fluid service. Session data and messages may be exchanged among clients, but will disappear once the no clients remain. (More specifically once no clients remain that have acquired the session `IPresence` interface.) Once fully implemented, no client will require container write permissions to use Presence features.
<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/presence
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/presence` like normal.

To access the `alpha` APIs, import via `@fluidframework/presence/alpha`.

## API Documentation

API documentation for **@fluidframework/presence** is available at <https://fluidframework.com/docs/apis/presence>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
## Concepts

### Attendees

For the lifetime of a session, each client connecting will be established as a unique and stable `ISessionClient`. The representation is stable because it will remain the same `ISessionClient` instance independent of connection drops and reconnections.

Client Ids maintained by `ISessionClient` may be used to associate `ISessionClient` with quorum, audience, and service audience members.

### Workspaces

Within Presence data sharing and messaging is broken into workspaces with custom identifiers (workspace addresses). Clients must use the same address within a session to connect with others. Unique addresses enable logical components within a client runtime to remain isolated or work together (without other piping between those components).

There are two types of workspaces: States and Notifications.

#### States Workspace

A states workspace, `PresenceStates`, allows sharing of simple data across attendees where each attendee maintains their own data values that others may read, but not change. This is distinct from a Fluid DDS where data values might be manipulated by multiple clients and one ultimate value is derived. Shared, independent values are maintained by value managers that specialize in incrementality and history of values.

#### Notifications Workspace

A notifications workspace, `PresenceNotifications`, is similar to states workspace, but is dedicated to notification use-cases via `NotificationsManager`.


### Value Managers

#### LatestValueManager

Latest value manager retains the most recent atomic value each attendee has shared. Use `Latest` to add one to `PresenceStates` workspace.

#### LatestMapValueManager

Latest map value manager retains the most recent atomic value each attendee has shared under arbitrary keys. Values associated with a key may be nullified (appears as deleted). Use `LatestMap` to add one to `PresenceStates` workspace.

#### NotificationsManager

Notifications value managers are special case where no data is retained during a session and all interactions appear as events that are sent and received. Notifications value managers may be mixed into a `PresenceStates` workspace for convenience. They are the only type of value managers permitted in a `PresenceNotifications` workspace. Use `Notifications` to add one to `PresenceNotifications` or `PresenceStates` workspace.


## Onboarding

While this package is developing and other Fluid Framework internals are being updated to accommodate it, a temporary Shared Object must be added within container to gain access.

```typescript
import { acquirePresenceViaDataObject, ExperimentalPresenceManager } from "@fluidframework/presence/alpha";

const containerSchema = {
	initialObjects: {
        presence: ExperimentalPresenceManager
    }
} satisfies ContainerSchema;

const presence = await acquirePresenceViaDataObject(container.initialObjects.presence);
```


## Limitations

### States Reliability

The current implementation relies on Fluid Framework's Signal infrastructure instead of Ops. This has advantages, but comes with some risk of unreliable messaging. The most common known case of unreliable signals occurs during reconnection periods and current implementation attempts to account for that. Be aware that all clients are not guaranteed to arrive at eventual consistency. Please [file a new issue](https://github.com/microsoft/FluidFramework/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=Presence:%20States:%20) if one is not found under [Presence States issues](https://github.com/microsoft/FluidFramework/issues?q=is%3Aissue+%22Presence%3A+States%3A%22).

### Compatibility and Versioning

Current API does not provide a mechanism to validate that state and notification data received within session from other clients matches the types declared. The schema of workspace address, states and notifications names, and their types will only be consistent when all clients connected to the session are using the same types for a unique value/notification path (workspace address + name within workspace). In other words, don't mix versions or make sure to change identifiers when changing types in a non-compatible way.

Example:

```typescript
presence.getStates("app:v1states", { myState: Latest({x: 0})});
```
 is incompatible with
```typescript
presence.getStates("app:v1states", { myState: Latest({x: "text"})});
```
as "app:v1states"+"myState" have different value type expectations: `{x: number}` versus `{x: string}`.

```typescript
presence.getStates("app:v1states", { myState2: Latest({x: true})});
```
 would be compatible with both of the prior schemas as "myState2" is a different name. Though in this situation none of the different clients would be able to observe each other.


### Notifications

Notifications API is partially implemented. All messages are always broadcast even if `unicast` API is used. Type inferences are not working even with a fully specified `initialSubscriptions` value provided to `Notifications` and schema type must be specified explicitly.

Notifications are fundamentally unreliable at this time as there are no built-in acknowledgements nor retained state. To prevent most common loss of notifications, always check for connection before sending.

### Throttling/grouping

Presence updates are grouped together and throttled to prevent flooding the network with messages when presence values are rapidly updated. This means the presence infrastructure will not immediately broadcast updates but will broadcast them after a configurable delay.

The `allowableUpdateLatencyMs` property configures how long a local update may be delayed under normal circumstances, enabling grouping with other updates. The default `allowableUpdateLatencyMs` is **60 milliseconds** but may be (1) specified during configuration of a [States Workspace](#states-workspace) or [Value Manager](#value-managers) and/or (2) updated later using the `controls` member of Workspace or Value Manager. [States Workspace](#states-workspace) configuration applies when a Value Manager does not have its own setting.

Notifications are never queued; they effectively always have an `allowableUpdateLatencyMs` of 0. However, they may be grouped with other updates that were already queued.

Note that due to throttling, clients receiving updates may not see updates for all values set by another. For example,
with `Latest*ValueManagers`, the only value sent is the value at the time the outgoing grouped message is sent. Previous
values set by the client will not be broadcast or seen by other clients.

#### Example

You can configure the grouping and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

```ts
// Configure a states workspace
const stateWorkspace = presence.getStates("app:v1states",
	{
		// This value manager has an allowable latency of 100ms.
		position: Latest({ x: 0, y: 0 }, { allowableUpdateLatencyMs: 100 }),
		// This value manager uses the workspace default.
		count: Latest({ num: 0 }),
	},
	// Specify the default for all value managers in this workspace to 200ms,
    // overriding the default value of 60ms.
	{ allowableUpdateLatencyMs: 200 }
);

// Temporarily set count updates to send as soon as possible
const countState = stateWorkspace.props.count;
countState.controls.allowableUpdateLatencyMs = 0;
countState.local = { num: 5000 };

// Reset the update latency to the workspace default
countState.controls.allowableUpdateLatencyMs = undefined;
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is no longer supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
