# @fluidframework/fluid-static

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

### Minor Changes

-   The inbound and outbound properties have been removed from IDeltaManager ([#22282](https://github.com/microsoft/FluidFramework/pull/22282)) [45a57693f2](https://github.com/microsoft/FluidFramework/commit/45a57693f291e0dc5e91af7f29a9b9c8f82dfad5)

    The inbound and outbound properties were [deprecated in version 2.0.0-rc.2.0.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.0.0-rc.2.0.0.md#container-definitions-deprecate-ideltamanagerinbound-and-ideltamanageroutbound) and have been removed from `IDeltaManager`.

    `IDeltaManager.inbound` contained functionality that could break core runtime features such as summarization and processing batches if used improperly. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    Similarly, `IDeltaManager.outbound` contained functionality that could break core runtime features such as generation of batches and chunking. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    #### Alternatives

    -   Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
    -   Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
    -   Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   fluid-framework: Type Erase ISharedObjectKind ([#21081](https://github.com/microsoft/FluidFramework/pull/21081)) [78f228e370](https://github.com/microsoft/FluidFramework/commit/78f228e37055bd4d9a8f02b3a1eefebf4da9c59c)

    A new type, `SharedObjectKind` is added as a type erased version of `ISharedObjectKind` and `DataObjectClass`.

    This type fills the role of both `ISharedObjectKind` and `DataObjectClass` in the `@public` "declarative API" exposed in the `fluid-framework` package.

    This allows several types referenced by `ISharedObjectKind` to be made `@alpha` as they should only need to be used by legacy code and users of the unstable/alpha/legacy "encapsulated API".

    Access to these now less public types should not be required for users of the `@public` "declarative API" exposed in the `fluid-framework` package, but can still be accessed for those who need them under the `/legacy` import paths.
    The full list of such types is:

    -   `SharedTree` as exported from `@fluidframwork/tree`: It is still exported as `@public` from `fluid-framework` as `SharedObjectKind`.
    -   `ISharedObjectKind`: See new `SharedObjectKind` type for use in `@public` APIs.
        `ISharedObject`
    -   `IChannel`
    -   `IChannelAttributes`
    -   `IChannelFactory`
    -   `IExperimentalIncrementalSummaryContext`
    -   `IGarbageCollectionData`
    -   `ISummaryStats`
    -   `ISummaryTreeWithStats`
    -   `ITelemetryContext`
    -   `IDeltaManagerErased`
    -   `IFluidDataStoreRuntimeEvents`
    -   `IFluidHandleContext`
    -   `IProvideFluidHandleContext`

    Removed APIs:

    -   `DataObjectClass`: Usages replaced with `SharedObjectKind`.
    -   `LoadableObjectClass`: Replaced with `SharedObjectKind`.
    -   `LoadableObjectClassRecord`: Replaced with `Record<string, SharedObjectKind>`.
    -

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

-   azure-client, tinylicious-client: compatibilityMode parameter added to createContainer and getContainer on AzureClient and TinyliciousClient ([#20997](https://github.com/microsoft/FluidFramework/pull/20997)) [2730787209](https://github.com/microsoft/FluidFramework/commit/2730787209a60155752d51da3c78cf97e1b5f3f9)

    To support migration from 1.x to 2.0, a compatibility mode parameter has been added to these methods on AzureClient and TinyliciousClient. When set to "1", this allows interop between the 2.0 clients and 1.x clients. When set to "2", interop with 1.x clients is disallowed but new 2.0 features may be used.

## 2.0.0-rc.4.0.0

### Minor Changes

-   Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id` [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client.
    2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR.

## 2.0.0-rc.3.0.0

### Major Changes

-   Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**

### Minor Changes

-   fluid-framework: Replace SharedObjectClass with new ISharedObjectKind type. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    The static objects used as SharedObjectClass now explicitly implement the new ISharedObjectKind type.
    SharedObjectClass has been removed as ISharedObjectKind now fills that role.
    LoadableObjectCtor has been inlined as it only had one use: an external user of it can replace it with `(new (...args: any[]) => T)`.

-   fluid-framework: Make some interface members readonly [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Remove unneeded mutability from some interface members.

## 2.0.0-rc.2.0.0

### Minor Changes

-   fluid-framework: ContainerSchema is now readonly ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    The `ContainerSchema` type is intended for defining input to these packages. This should make the APIs more tolerant and
    thus be non-breaking, however its possible for some users of `ContainerSchema` to use it in ways where this could be a
    breaking change: any such users should remove their mutations and/or use a different type.

## 2.0.0-rc.1.0.0

### Minor Changes

-   Updated server dependencies ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The following Fluid server dependencies have been updated to the latest version, 3.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/releases/tag/server_v3.0.0)

    -   @fluidframework/gitresources
    -   @fluidframework/server-kafka-orderer
    -   @fluidframework/server-lambdas
    -   @fluidframework/server-lambdas-driver
    -   @fluidframework/server-local-server
    -   @fluidframework/server-memory-orderer
    -   @fluidframework/protocol-base
    -   @fluidframework/server-routerlicious
    -   @fluidframework/server-routerlicious-base
    -   @fluidframework/server-services
    -   @fluidframework/server-services-client
    -   @fluidframework/server-services-core
    -   @fluidframework/server-services-ordering-kafkanode
    -   @fluidframework/server-services-ordering-rdkafka
    -   @fluidframework/server-services-ordering-zookeeper
    -   @fluidframework/server-services-shared
    -   @fluidframework/server-services-telemetry
    -   @fluidframework/server-services-utils
    -   @fluidframework/server-test-utils
    -   tinylicious

-   Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
    changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

## 2.0.0-internal.8.0.0

### Major Changes

-   azure-client: Removed deprecated FluidStatic classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    Several FluidStatic classes were unnecessarily exposed and were deprecated in an earlier release. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The removed classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.4.0

### Minor Changes

-   azure-client: Deprecated FluidStatic Classes ([#18402](https://github.com/microsoft/FluidFramework/issues/18402)) [589ec39de5](https://github.com/microsoft/FluidFramework/commits/589ec39de52116c7f782319e6f6aa61bc5aa9964)

    Several FluidStatic classes were unnecessarily exposed. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The deprecated classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dependencies on the following Fluid server package have been updated to version 2.0.1:

    -   @fluidframework/gitresources: 2.0.1
    -   @fluidframework/server-kafka-orderer: 2.0.1
    -   @fluidframework/server-lambdas: 2.0.1
    -   @fluidframework/server-lambdas-driver: 2.0.1
    -   @fluidframework/server-local-server: 2.0.1
    -   @fluidframework/server-memory-orderer: 2.0.1
    -   @fluidframework/protocol-base: 2.0.1
    -   @fluidframework/server-routerlicious: 2.0.1
    -   @fluidframework/server-routerlicious-base: 2.0.1
    -   @fluidframework/server-services: 2.0.1
    -   @fluidframework/server-services-client: 2.0.1
    -   @fluidframework/server-services-core: 2.0.1
    -   @fluidframework/server-services-ordering-kafkanode: 2.0.1
    -   @fluidframework/server-services-ordering-rdkafka: 2.0.1
    -   @fluidframework/server-services-ordering-zookeeper: 2.0.1
    -   @fluidframework/server-services-shared: 2.0.1
    -   @fluidframework/server-services-telemetry: 2.0.1
    -   @fluidframework/server-services-utils: 2.0.1
    -   @fluidframework/server-test-utils: 2.0.1
    -   tinylicious: 2.0.1

-   test-utils: provideEntryPoint is required [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The optional `provideEntryPoint` method has become required on a number of constructors. A value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    See [testContainerRuntimeFactoryWithDefaultDataStore.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/test/test-utils/src/testContainerRuntimeFactoryWithDefaultDataStore.ts) for an example implemtation of `provideEntryPoint` for ContainerRuntime.
    See [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83) for an example implementation of `provideEntryPoint` for DataStoreRuntime.

    Subsequently, various `entryPoint` and `getEntryPoint()` endpoints have become required. Please see [containerRuntime.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/containerRuntime.ts) for example implementations of these APIs.

    For more details, see [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

### Minor Changes

-   Remove use of @fluidframework/common-definitions ([#16638](https://github.com/microsoft/FluidFramework/issues/16638)) [a8c81509c9](https://github.com/microsoft/FluidFramework/commits/a8c81509c9bf09cfb2092ebcf7265205f9eb6dbf)

    The **@fluidframework/common-definitions** package is being deprecated, so the following interfaces and types are now
    imported from the **@fluidframework/core-interfaces** package:

    -   interface IDisposable
    -   interface IErrorEvent
    -   interface IErrorEvent
    -   interface IEvent
    -   interface IEventProvider
    -   interface ILoggingError
    -   interface ITaggedTelemetryPropertyType
    -   interface ITelemetryBaseEvent
    -   interface ITelemetryBaseLogger
    -   interface ITelemetryErrorEvent
    -   interface ITelemetryGenericEvent
    -   interface ITelemetryLogger
    -   interface ITelemetryPerformanceEvent
    -   interface ITelemetryProperties
    -   type ExtendEventProvider
    -   type IEventThisPlaceHolder
    -   type IEventTransformer
    -   type ReplaceIEventThisPlaceHolder
    -   type ReplaceIEventThisPlaceHolder
    -   type TelemetryEventCategory
    -   type TelemetryEventPropertyType

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   RootDataObject and RootDataObjectProps no longer exported from fluid-static or fluid-framework packages [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    RootDataObject and RootDataObjectProps are internal implementations and not intended for direct use. Instead use IRootDataObject to refer to the root data object.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

### Major Changes

-   The following functions and classes were deprecated in previous releases and have been removed: [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    -   `PureDataObject.getFluidObjectFromDirectory`
    -   `IProvideContainerRuntime` and its `IContainerRuntime` member.
    -   `ContainerRuntime`'s `IProvideContainerRuntime` has also been removed.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.

## 0.39.0

### [BREAKING] 'FluidStatic' has been moved to have separate client packages unique to each service

There is no longer a general `FluidStatic` class. It has instead been replaced by implementations that define a unique paradigm for each service that the client is trying to communicate with. For example, when using Tinylicious, please see the details on using the `TinyliciousClient` from the [documentation](../tinylicious-client/README.MD) `@fluidframework/tinylicious-client`.

### [BREAKING] 'ContainerConfig' has been renamed to 'ContainerSchema'

The interface for defining the container's initial object and supported dynamic object types has been renamed to `ContainerSchema` to differentiate it from the config interfaces that will be supplied for each service, i.e. `TinyliciousConnectionConfig` and `TinyliciousContainerConfig` from `@fluidframework/tinylicious-client`.

`ContainerSchema` is used uniformly across all different services that are using the container supplied by the `FluidStatic` package, whereas the service configs are unique.

## 0.38.0

### DDS object types are now supported

Distributed Data Objects (DDSes) are now supported along side DataObjects.

Both DDS and DataObject are implementation details of how to access collaborative data. This change allows you to define both DDSes and DataObjects in the `initalObjects` part of the `ContainerConfig`.

#### Example

```javascript
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { SharedMap } from "@fluidframework/map";

// ...

const containerConfig = {
	name: "my-container",
	initialObjects: {
		pair1: KeyValueDataObject,
		map1: SharedMap,
	},
};
```

### `initialObjects` are available as an object on the FluidContainer

The `get()` function has been replaced with an `initialObjects` object that reflects the `initialObjects` definition provided in the `ContainerConfig`

This change also introduces all `initialObjects` as statically loaded when the `FluidContainer` loads. This allows developers to more easily engage with their `initialObjects`.

#### Example

```javascript
const config = {
	name: "my-container",
	initialObjects: {
		map1: SharedMap,
		map2: SharedMap,
	},
};

// ...

const container = await Fluid.getContainer("some-id", config);
const initialObjects = container.initialObjects;
const map1 = initialObjects.map1;
const map2 = initialObjects["map2"];
```

### [BREAKING] `ContainerConfig` has renames

`ContainerConfig` has overhauled to provide simpler syntax and support DDS types.

```typescript
interface ContainerConfig {
	name: string;
	initialObjects: LoadableObjectClassRecord;
	dynamicObjectTypes?: LoadableObjectClass<any>[];
}
```

For details of each property above see `ContainerConfig` in [./src/types](./src/types.ts)

#### Example

```javascript
const config = {
	name: "my-container",
	initialObjects: {
		pair1: KeyValueDataObject,
		map1: SharedMap,
	},
	dynamicObjectTypes: [SharedDirectory, SharedString],
};
```

### [BREAKING] `CreateContainerConfig` has been removed

`CreateContainerConfig` has been merged into `ContainerConfig`.

See **[[BREAKING] `ContainerConfig` has renames](#[BREAKING]-`ContainerConfig`-has-renames)** for more details.

### [BREAKING] `getDataObject` is no longer avaiable

`getDataObject` has been removed and replaced.

To get `initialObjects` use `container.initialObjects`.

For dynamically create objects see **[[BREAKING] `createDataObject` is replaced by `create`](#breaking-createdataobject-is-replaced-by-create)** below.

### [BREAKING] `createDataObject` is replaced by `create`

This change is not just a rename but a fundamental change in the dynamic create flow. Below is a brief description of how to now use dynamic objects. This change introduces developer complexity and we will be following this change with further tutorials and documentation.

The change involves moving object management from Fluid to the developer. This change aligns with the create paradigm within Fluid and can happen because of the introduction of `DDSes` as storage objects.

#### Example

In version after `0.38.0` the `FluidContainer` will help support object creation but the developer will be responsible for management. This requires more upfront work from the developer but also provides extended flexibility.

Because the `FluidContainer` will no longer be maintaining object lifecycle the developer will be responsible for this. To do this the developer needs to have an existing object that can store Loadable objects. The two recommendations are the `SharedMap` and `SharedDirectory`.

```javascript
const config = {
	name: "my-container",
	initialObjects: {
		map1: SharedMap,
	},
	dynamicObjectTypes: [KeyValueDataObject],
};

const container = Fluid.getContainer("some-id", config);
const map1 = container.initialObjects.map1;

// Create dynamic object
const newMap = await container.create(SharedMap);

// Setting the new map requires setting the handle and not the object itself
map1.set("map2", newMap.handle);

// The key of "map2" has a handle to the SharedMap and not the object itself.
const map2Handle = map1.get("map2");
const map2 = await map2Handle.get();

// Alternate syntax
const map2 = await map1.get("map2").get();
```
