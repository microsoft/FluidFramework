# 0.3 Breaking Changes

This document lists the set of breaking changes as part of upgrading to 0.3
- [Legacy chaincode API removal](#legacy-chaincode-api-removal)
- [Container and Component Packages and Classes Renamed](#container-and-component-packages-and-classes-renamed)
- [SparseMatrix moved](#sparsematrix-moved)
- [Rename one of the IComponentRegistry definition to ISharedObjectRegistry](#rename-one-of-the-icomponentregistry-definition-to-isharedobjectregistry)
- [API ITree and ISnapshotTree "sha" properties have been renamed to "id"](#api-itree-and-isnapshottree-sha-properties-have-been-renamed-to-id)
- [Rename IComponentContext getComponent method](#rename-icomponent-getcomponent-method)
- [Rename api-definitions package](#rename-api-definitions-package)
- [Rename IDistributedObjectServices](#rename-idistributedobjectservices)

## Legacy chaincode API removal

The legacy definitions inside of @prague/runtime-defintions have been removed. This primarily was the `IChaincode`
and `IRuntime` interfaces. These interfaces existed to make use of the legacy chaincode packages as the component
runtime was bootstrapped. Now that these legacy packages have been converted to the updated API there is no longer
a need to have these legacy interfaces in the core runtime.

### instantiateComponent

In 0.2 `instantiateComponent` is defined as

```typescript
export interface IComponentFactory {
    instantiateComponent(): Promise<IChaincodeComponent>;
}
```

With the switch to 0.3 we now have `instantiateComponent` look similar to `instantiateRuntime`. Rather than binding
the context to the component after making the instantiate call we now do it as part of it. This simplifies
the startup logic.

Also similar to `instantiateRuntime` the `instantiateComponent` returns the created runtime object. This object will
be what gets notified of core operations like op processing and request handling.

```typescript
export interface IComponentFactory {
    instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
}
```

If you were making use of the @prague/app-component package then there is a static helper function on `Component`
called `createComponentFactory` that simplifies this startup behavior.

### ComponentHost is now ComponentRuntime

The old `ComponentHost` has been renamed `ComponentRuntime`.

Similar to the underlying runtime this class serves as a common set of code used to manage the runtime behavior for
a component. It deals with op routing, snapshot loads, and data structure management.

### ComponentRuntime does not reference app code

The old `ComponentHost` would take a reference to the dynamically loaded chaincode. This led to needing
to dot into the runtime in most cases to find its component.

Instead in 0.3 the `ComponentRuntime` matches the underlying `Runtime` in giving access to app defined components
via the request mechanism. `ComponentRuntime` exposes a `registerRequestHandler` function which can be used
to define URL request routes. The default behavior when making use of @prague/app-component is to return the
`Component` when making a request against / as shown in the snippet below. App developers can customize
this behavior should they need more control.

```typescript
debug(`${this.dbgName}.instantiateComponent()`);

// Instantiation of underlying data model for the component
debug(`${this.dbgName}.LoadFromSnapshot() - begin`);
this._host = await ComponentRuntime.LoadFromSnapshot(context, new Map(this[typeToFactorySym]));
debug(`${this.dbgName}.LoadFromSnapshot() - end`);

// Load the app specific code. We do not await on it because it is not needed to begin inbounding operations.
// The promise is awaited on when URL request are made against the component.
this._host.registerRequestHandler(async (request: IRequest) => {
    debug(`request(url=${request.url})`);
    return request.url && request.url !== "/"
        ? this.request(request)
        : { status: 200, mimeType: "prague/component", value: this };
});

return this._host;
```

Developers should gain access to components in almost all cases by URL. The API will both make this simpler to do
and begin requiring it in later PRs.

### @prague/app-component Component

The Component defined in the app-component package largely has stayed the same. The one primary change is that
it now takes in an `IComponentRegistry` rather than a map of strings to `IChaincodeComponent` constructors.

The `IComponentRegistry` is defined as

```typescript
export interface IComponentRegistry {
    get(name: string): Promise<IComponentFactory>;
}
```

By using the registry a developer can make use of components not defined with @prague/app-component. The es6 map
can be used to easily implement this type. But an end user can have more control, especially with regards to dynamic
loading, by directly implenting it.

Conversion from the old constructor form to this new one is largely a mechanical process of wrapping the constructor
with a call to `Component.createComponentFactory`. For example here is an existing call and its updating version.

Existing:

```typescript
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [
        ["@chaincode/chart-view", Promise.resolve(chartView.ChartView)],
        ["@chaincode/flow-document", Promise.resolve(flowDocument.FlowDocument)],
    ]);
}
```

And then its updated version:

```typescript
return Component.instantiateRuntime(
        context,
        pkg.name,
        new Map([
            ["@chaincode/chart-view", Promise.resolve(Component.createComponentFactory(chartView.ChartView))],
            ["@chaincode/flow-document", Promise.resolve(Component.createComponentFactory(flowDocument.FlowDocument))],
        ]));
```
## Container and Component Packages and Classes Renamed

The following classes and packages are renamed to align with what they are.

```
Context -> ContainerContext
Runtime -> ContainerRuntime
```
```
Package @prague/runtime -> @prague/container-runtime
Package @prague/component -> @prague/component-runtime
```

## SparseMatrix moved
Move SparseMatrix to @prague/sequence to avoid circular dependencies when adding to client-api

## Rename one of the IComponentRegistry definition to ISharedObjectRegistry
The IComponentRegistry in component-runtime should be a ISharedObjectRegistry
Also renamed ComponentRuntime.LoadFromSnapshot to ComponentRuntime.Load
and switch the argument order for ContainerRuntime.Load to make those match

## API ITree and ISnapshotTree "sha" properties have been renamed to "id"
The "sha" property has been renamed to "id" on the ITree and ISnapshotTree interfaces in  @prague/container-definitions since this property should not be assumed to be a sha. Storage drivers may need to be updated to accommodate this change

## Rename IComponentContext getComponent method
To match what the method is returning, rename:
  `IComponentContext.getComponent` -> `IComponentContext.getComponentRuntime`

## Rename api-definitions package
This package no longer houses interface definitions, but rather has the base class of all the shared objects in the runtime.  Renaming:
  `@prague/api-definitions` -> `@prague/shared-object-common`

## Rename IDistributedObjectServices
Renaming for consistency with the rest of the runtime:
  `IDistributedObjectServices` -> `ISharedObjectServices`
