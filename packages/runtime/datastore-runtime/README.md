# @fluidframework/datastore-runtime

# Component Handle
A Component Handle is a handle to a fluid object like a `Component` or a `SharedObject` (DDS). It can be used to represent the object in the system and has the capability to get the underlying object by calling `get()` on it.

The two major interfaces required to implement a Component Handle are `IComponentHandle` and `IComponentHandleContext` defined in [componentHandle.ts](src\componentHandle.ts).

## IComponentHandle
`IComponentHandle` has only one method `get` that is used to retrieve the underlying object it represents. It also extends `IComponentHandleContext`.

## IComponentHandleContext
`IComponentHandleContext` describes a routing context (another `IComponentHandleContext`) that has a path to this `IComponentHandleContext`. When creating a Component Handle for a `SharedComponent`, the route context should be the `ComponentRuntime` which knows how to reach the `SharedComponent`. Similarly, the `ComponentRuntime's` route context should be the `ContainerRuntime` which knows how to reach it.

For more details on Component Handles, check this [doc](../../../docs/docs/component-handles.md).
