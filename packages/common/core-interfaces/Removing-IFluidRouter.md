# Removing IFluidRouter

The interface `IFluidRouter` is being deprecated and removed over the next several internal releases.
It exposes a `request` function and is implemented across Fluid Framework's layers to light up the "request pattern"
for accessing objects out of a Fluid Container.
The request pattern is incompatible with [Garbage Collection](../../runtime/container-runtime/src/gc/garbageCollection.md),
so any code that previously accessed an object via request should migrate to using handles instead.

This document serves as a "how-to" guide for this migration, and will also include the latest status of the work.

## Key Concepts

### `IFluidRouter` and `absolutePath`

Here's what [`IFluidRouter`](src/fluidRouter.ts) looks like:

```ts
export interface IProvideFluidRouter {
	readonly IFluidRouter: IFluidRouter;
}
export interface IFluidRouter extends IProvideFluidRouter {
	request(request: IRequest): Promise<IResponse>;
}
```

It uses the Provider pattern so any Fluid Object may be queried for `IFluidRouter` to call `request` on if present.

Here's the **deprecated** flow for referencing and accessing an object:

1. Store the object's `absolutePath` (a container-relative URL path) in some DDS
2. Later, load the object via `request({ url: absolutePath })`

### `IFluidLoadable` and `IFluidHandle`

The new way to reference an object within a Fluid Container is via its `handle`:

1. Store the object's `handle` in some DDS
2. Later, load the object via `handle.get()`

### Entry Point

`request` has also been used as the way to get at the application-specific Container and DataStore implementations
starting from native Fluid types like `IContainer` and `IDataStore` - both of which have extended `IFluidRouter`.
The new way to do this is via the object's "entry point".

Here it is on `IContainer`, returning an anonymous `FluidObject` - the application-specified root object:

```ts
getEntryPoint(): Promise<FluidObject | undefined>;
```

And here it is on `IDataStore`, returning an `IFluidHandle` to an anonymous `FluidObject` - the DataStore's root object:

```ts
readonly entryPoint: IFluidHandle<FluidObject>;
```

So how does an application specify what the Container or DataStore's entry point is?
Via a parameter `provideEntryPoint` that's found on `ContainerRuntime.loadRuntime` and `FluidDataStoreRuntime`'s constructor.

See [testContainerRuntimeFactoryWithDefaultDataStore.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/test/test-utils/src/testContainerRuntimeFactoryWithDefaultDataStore.ts) for an example implemtation of `provideEntryPoint` for ContainerRuntime.
See [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83) for an example implementation of `provideEntryPoint` for DataStoreRuntime.

### ILoader request pattern

The `request` API (associated with the `IFluidRouter` interface) has been deprecated on `ILoader` and `Loader`.

After calling `ILoader.resolve(...)`, call the `getEntryPoint()` method on the returned `IContainer`.
The following is an example of what this change may look like:

```ts
// OLD
const request: IRequest;
const urlResolver = new YourUrlResolver();
const loader = new Loader({ urlResolver, ... });

await loader.resolve(request);
const response = loader.request(request);
```

```ts
// NEW
const request: IRequest;
const urlResolver = new YourUrlResolver();
const loader = new Loader({ urlResolver, ... });

const container = await loader.resolve(request);
const entryPoint = await container.getEntryPoint();
```

### Aliased DataStores

(Not yet written)

## Status

<!-- prettier-ignore-start -->
| API                                                                                          | Deprecated in        | Removed in           |
| -------------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| `IContainer.request` (except calling with "/")                                               | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `IDataStore.request` (except calling with "/")                                               | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `IContainer.IFluidRouter`                                                                    | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `IDataStore.IFluidRouter`                                                                    | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `request` and `IFluidRouter` on `ILoader` and `Loader`                                       | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `request` and `IFluidRouter` on `IRuntime` and `ContainerRuntime`                            | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `request` and `IFluidRouter` on `IFluidDataStoreRuntime`                                     | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `IFluidRouter` on `IFluidDataStoreChannel` and `FluidDataStoreRuntime`                       | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `getRootDataStore` on `IContainerRuntime` and `ContainerRuntime`                             | 2.0.0-internal.6.0.0 | 2.0.0-internal.8.0.0 |
| `resolveHandle` on `IContainerRuntime`                                                       | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `IFluidHandleContext` on `IContainerRuntimeBase`                                             | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `requestHandler` property in `ContainerRuntime.loadRuntime(...)`                             | 2.0.0-internal.7.0.0 |                      |
| `RuntimeRequestHandler` and `RuntimeRequestHandlerBuilder`                                   | 2.0.0-internal.7.0.0 |                      |
| `request` and `IFluidRouter` on `IContainer` and `Container`                                 | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `request` on `IDataStore`                                                                    | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `IFluidRouter` and `IProvideFluidRouter`                                                     | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `requestFluidObject`                                                                         | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `requestResolvedObjectFromContainer`                                                         | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
| `getDefaultObjectFromContainer`, `getObjectWithIdFromContainer` and `getObjectFromContainer` | 2.0.0-internal.7.0.0 | 2.0.0-internal.8.0.0 |
<!-- prettier-ignore-end -->

The removal of some items will need to wait for the LTS version of the `Loader` to reach "2.0.0-internal.7.0.0". This is because old `Loader` or `Container` code doesn't know about the new `entryPoint` pattern and will still attempt to use the `request` pattern. The following items are affected:

-   `requestHandler` property in `ContainerRuntime.loadRuntime(...)`, `BaseContainerRuntimeFactory`, `ContainerRuntimeFactoryWithDefaultDataStore`, `mixinAttributor`, `RuntimeFactory`, `TestContainerRuntimeFactory`
-   `RuntimeRequestHandler` and `RuntimeRequestHandlerBuilder`
