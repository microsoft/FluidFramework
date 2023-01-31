# @fluidframework/datastore

# Fluid Handle

A Fluid handle is a handle to a Fluid object like a `DataStore` or a `SharedObject` (DDS). It can be used to represent the object in the system and has the capability to get the underlying object by calling `get()` on it.

The two major interfaces required to implement a Fluid handle are `IFluidHandle` and `IFluidHandleContext` defined in [fluidHandle.ts](src/fluidHandle.ts).

## IFluidHandle

`IFluidHandle` has only one method `get` that is used to retrieve the underlying object it represents. It also extends `IFluidHandleContext`.

## IFluidHandleContext

`IFluidHandleContext` describes a routing context (another `IFluidHandleContext`) that has a path to this `IFluidHandleContext`. When creating a Data Store Handle the route context should be the `FluidDataStoreRuntime` which knows how to reach the `FluidDataStore`. Similarly, the `FluidDataStoreRuntime's` route context should be the `ContainerRuntime` which knows how to reach it.

For more details on Fluid Handles, check this [doc](../../../content/docs/advanced/handles.md).
