# @fluidframework/fluid-static

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
