# @fluidframework/fluid-static

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
