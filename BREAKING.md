# 0.11 Breaking Changes


# 0.10 Breaking Changes

- [`@fluid-example/tiny-web-host` prague -> fluid changes](#fluid-exampletiny-web-host-prague---fluid-changes)
- [prague URIs changed to fluid](#prague-URIs-changed-to-fluid)
- [DistributedSet removed](#distributedset-removed)
- [`Stream` renamed to `Ink`](#stream-renamed-to-ink)
- [`insertSiblingSegment` change to `insertAtReferencePosition`](#insertAtReferencePosition)
- [MergeTree Client No Longer Public on Sequence](#MergeTree-Client-No-Longer-Public-on-Sequence)
- [`.createValueType` replaces third argument to `.set`](#.createValueType-replaces-third-argument-to-.set)


## `@fluid-example/tiny-web-host` prague -> fluid changes
`loadPragueComponent`, `loadIFramedPragueComponent`, and `isPragueUrl` from `@fluid-example/tiny-web-host` have been renamed to `loadFluidComponent`, `loadIFramedFluidComponent`, and `isFluidUrl`, respectively.

## prague URIs changed to fluid
`prague://` and `prague-odsp://` URIs have been changed to `fluid://` and `fluid-odsp://` respectively.

## DistributedSet removed
The DistributedSet value type has been removed.

## `Stream` renamed to `Ink`
The `Stream` data structure (and associated interfaces and classes like `IStream`, `StreamFactory`, etc.) have been renamed to `Ink` (`IInk`, `InkFactory`, etc.).  They are available in `@microsoft/fluid-ink`.

## insertAtReferencePosition
insertSiblingSegment has been removed and insertAtReferencePosition has been added.
Before:
```typescript
    const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject());
    const insertOp = this.sequence.client.insertSiblingSegment(sg, insertSegment);
    if (insertOp) {
        this.sequence.submitSequenceMessage(insertOp);
    }
```
After:
```typescript
    const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject());
    this.sequence.insertAtReferencePosition(
            this.sequence.createPositionReference(sg, 0, ReferenceType.Transient),
            insertSegment);
```
## MergeTree Client No Longer Public on Sequence
The client property is not longer public on sequence. All existing and supported functionality should be used off sequence itself.

## `.createValueType` replaces third argument to `.set`
Previously, to create a value type on an ISharedMap or IDirectory you would pass a third type argument to `.set`.  This functionality has been moved to a separate API, `.createValueType`.
Before:
```typescript
myMap.set("myKey", 0, CounterValueType.Name);
```
After:
```typescript
myMap.createValueType("myKey", CounterValueType.Name, 0);
```

# 0.9 Breaking Changes (August 26, 2019)

- [PrimedComponent root is now a SharedDirectory](#primedcomponent-root-is-now-a-shareddirectory)
- [Handles to SharedObjects must be used on map sets](#handles-to-sharedobjects-must-be-used-on-map-sets)
- [`mergeTree` is now protected on `MergeTree.Client`](#mergetree-is-now-protected-on-mergetree.client)
- [No more Value Type registration](#no-more-value-type-registration)

## PrimedComponent root is now a SharedDirectory

Previously, the root provided by `PrimedComponent` was a `SharedMap`.  Now it is a `SharedDirectory`.

This should be compatible for usage (e.g. existing calls to `get`, `set`, `wait`, etc. should work as before), but explicit type checks against `SharedMap` or `ISharedMap` should be updated to `SharedDirectory` and `ISharedDirectory` respectively.  Additionally, if your component is currently using a `SharedComponentFactory` you'll want to instead use a `PrimedComponentFactory` which will register the correct root factories on your behalf.

Before:
```typescript
export const ClickerInstantiationFactory = new SharedComponentFactory(
  Clicker,
  [
    SharedMap.getFactory([new CounterValueType()]),
  ],
);
```

After:
```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
  Clicker,
  [],
);
```

Alternatively you can register the `SharedDirectory` factory yourself (similar to how you were already registering the `SharedMap` factory), but the `PrimedComponentFactory` is recommended.

## Handles to SharedObjects must be used on map sets

It is no longer allowed to directly set a SharedObject as a map key. Instead its handle must be set. Get also only
returns handles. You can retrieve the value by calling get on the handle.

i.e. this

```
const map = SharedMap.create(runtime);
root.set("test", map);
const retrievedMap = root.get("test");
```

Becomes

```
const map = SharedMap.create(runtime);
root.set("test", map.handle);
const retrievedMap = await root.get<IComponentHandle>("test").get<ISharedMap>();
```

## `mergeTree` is now protected on `MergeTree.Client`
The merge tree in Client should be interacted with indirectly through Client or Sequence methods, rather than directly as was possible before. See "[Updated sequence API to provide richer access to the underlying merge tree](#updated-sequence-api-to-provide-richer-access-to-the-underlying-merge-tree)" from 0.8 breaking changes for more info.

## No more Value Type registration

Previously, you would register for value types on `SharedMap` and `SharedDirectory` either by passing an argument to the `MapFactory` or `DirectoryFactory` or by calling `registerValueType` on the map/directory itself.  Now all valid ValueTypes are registered by default.  You should remove these arguments/calls as they are no longer necessary and may cause compile errors.

## `prague/*` -> `fluid/*` MIME type
The `prague/component`, `prague/container`, and `prague/dataType` MIME types have been changed to `fluid/component`, `fluid/container`, and `fluid/dataType` respectively in requests/responses.

# 0.8 Breaking Changes (August 13, 2019)

- [`IComponent` not to be derived from](#icomponent-not-to-be-derived-from)
- [`sequence.annotateRange()` argument order changed](#sequenceannotaterange-argument-order-changed)
- [`sharedString.insertText()` argument order changed](#sharedstringinserttext-argument-order-changed)
- [`mergeTree.getOffset()` -> `mergeTree.getPosition()`](#mergetreegetoffset---mergetreegetposition)
- [Updated sequence API to provide richer access to the underlying merge tree](#updated-sequence-api-to-provide-richer-access-to-the-underlying-merge-tree)
- [ISequenceDeltaRange.offset -> ISequenceDeltaRange.position](#isequencedeltarangeoffset-isequencedeltarangeposition)
- [IComponent* interfaces from @prague/container-definitions are moved to @prague/component-core-interfaces](#icomponent-interfaces-from-praguecontainer-definitions-are-moved-to-praguecomponent-core-interfaces)
- [Deprecate @prague/app-component](#deprecate-pragueapp-component)
- [Query and List Removed From IComponent](#query-and-list-removed-from-icomponent)
- [Value type op change](#value-type-op-change)
- [`SharedMap.values()` and `.entries()` unpack local values](#sharedmapvalues-and-entries-unpack-local-values)
- [Deprecate @prague/app-datastore](#deprecate-pragueapp-datastore)

## `IComponent` not to be derived from

`IComponent` is no longer intended to be derived from. Instead it serves as a Fluid specific form of 'any' and that
clients can cast objects to in order to probe for implemented component interfaces.

## `sequence.annotateRange()` argument order changed

The `start` and `end` arguments of `sequence.annotateRange()` have been changed to the first two arguments to make the codebase more consistent. The new function signature is as below:

```typescript
public annotateRange(
        start: number,
        end: number,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) {
```

## `sharedString.insertText()` argument order changed

The `pos` and `text` arguments of `sharedString.insertText()` have been switched to make it more consistent with other sharedString methods. The new function signature is as below:

```typescript
public insertText(pos: number, text: string, props?: MergeTree.PropertySet) {
```

## `mergeTree.getOffset()` -> `mergeTree.getPosition()`

`mergeTree.getOffset()` and `Client.getOffset()` have been renamed to `getPosition()` to more accurately reflect their functionality.

## Updated sequence API to provide richer access to the underlying merge tree

The following methods of mergeTree have been exposed on sequence:

- `addLocalReference()`
- `removeLocalReference()`
- `posFromRelativePos()`
- `getPosition()`
- `getSegmentFromId()` (as `getMarkerFromId() on sharedString)
- `getContainingSegment()` (takes only one argument: position. If you want to use a remote refseq and/or clientID, use sequence.resolveRemoteClientPosition())
- `walkSegments()` (this should be used instead of `mergeTree.mapRange()`)
- `getStackContext()`

If these are being accessed directly from the sequence or client, they should be changed to access through sequence, since these will become private in mergeTree/mergeTree client in the future.

## ISequenceDeltaRange.offset -> ISequenceDeltaRange.position

The `offset` member of the ISequenceDeltaRange interface has been renamed to `position`

## IComponent* interfaces from @prague/container-definitions are moved to @prague/component-core-interfaces

The following interfaces have moved:

`IComponent`
`IComponentLoadable`
`IComponentRunnable`
`ISharedComponent`
`IComponentConfiguration`
`IComponentTokenProvider`
`IComponentRouter`
`IComponentHTMLRender`
`IComponentHTMLVisual`
`IComponentHTMLView`
`IComponentHTMLOptions`
`IRequest`
`IResponse`

## Query and List Removed From IComponent

The query and list methods have been removed from IComponent and been replaced with strongly type properties.

### Component Consumers

Consumers should update their code as follows.

Before:

```typescript
const thing = component.query<IComponentThing>('IComponentThing');
```

After:

```typescript
const thing = component.IComponentThing;
```

in both cases the consumer should check for undefined before using.

### Component Implementors

Component implementors no longer need to implement query, list, or supported interfaces. They now need to add a property for
each interface they implement, or wish to expose. They will get compile time errors if they do not implement these properties for
interfaces they implement.

Before:

```typescript
class MyComponent implements IComponentThing {
    private static readonly supportedInterfaces = ["IComponentThing"];

    public query<T>(id: string): T{
        if(this.list().indexOf(id) !== -1){
            return this as T
        }
        return undefined;
    }

    public list(): string[]{
        return MyComponent.supportedInterfaces;
    }

    public doThing(){
       // ...
    }
}
```

After:

```typescript
class MyComponent implements IComponentThing {

    public get IComponentThing() { return this; }

    public doThing() {
       // ...
    }
}
```

### Component Interface Implementors

Component interface implementors must do the following so that their interfaces are exposed off IComponent for consumers,
and so Component implementors get strong typing.

 Before:

```typescript
export interface IComponentThing {
    doThing(): void;
}
```

After:

```typescript
export interface IProvideComponentThing {
    // This property will be implemented
    // to expose this interface IComponentThing
    // For both direct implementors, and those that
    // delegate the implmentation to another object
    readonly IComponentThing: IComponentThing;
}

export interface IComponentThing extends IProvideComponentThing {
    doThing(): void;
}

// This augments the IComponent interface, so that
// all consumers who use your package will see your
// interface optionally exposed on IComponent
// You can find out more about module augmentation
// and interface merging here:
// https://www.typescriptlang.org/docs/handbook/declaration-merging.html
declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentThing>> {
    }
}
```

## Deprecate @prague/app-component

@prague/app-component is deprecated. Please switch to use @prague/aqueduct for the new component interfaces

## Value type op change

In 0.7 and below, the type of a SharedMap message for value types (Counter, DistributedSet, etc.) would match the type
("counter", "distributedSet", etc.).  In 0.8 the message type is "act" for all value types.  Value type ops produced
from runtimes before 0.8 are not compatible with 0.8 as a result (e.g. if replaying old ops).

## `SharedMap.values()` and `.entries()` unpack local values

Previously, `SharedMap.values()` and `SharedMap.entries()` would iterate over `ILocalViewElement`s rather than the
contained values.  To retrieve the contained values you would have then extracted the ILocalViewElement.localValue.
In 0.8 these methods now iterate over the contained values directly, so calls to get the .localValue should be
removed.

## Deprecate @prague/app-datastore

The package @prague/app-datastore is deprecated. Please switch to use tiny-web-host

# 0.7 Breaking Changes (July 30, 2019)

- [instantiateComponent changes](#instantiatecomponent-changes)

## instantiateComponent changes

`ComponentRuntime.load` no longer returns the runtime as a promise. Instead clients need to provide a callback to the
method which is called with the runtime as an argument once the runtime is loaded and ready. This method will be
called prior to resolving any requests for the component. Because of this clients should make sure to register all
request handlers prior to returning from the callback.

To convert modify

```typescript
const runtime = await ComponentRuntime.load(context, dataTypes);
const progressCollectionP = VideoPlayerCollection.load(runtime, context);
runtime.registerRequestHandler(async (request: IRequest) => {
    const progressCollection = await progressCollectionP;
    return progressCollection.request(request);
});
```

to

```typescript
ComponentRuntime.load(
    context,
    dataTypes,
    (runtime) => {
        const progressCollectionP = VideoPlayerCollection.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    });
```

`instantiateComponent` is now a void return type.

# 0.6 Breaking Changes (July 17, 2019)

- [Interface renames](#interface-renames)
- [defaultValueTypes is no longer global](#defaultvaluetypes-is-no-longer-global)
- [ContainerRuntime registerRequestHandler passed into the constructor](#containerruntime-registerrequesthandler-passed-into-the-constructor)

## Interface renames

- Interface `IPragueResolvedUrl` renamed to `IFluidResolvedUrl`
- Interface `IChaincodeFactory` renamed to `IRuntimeFactory`.
- Deprecated `IComponent` interface has been removed
- Deprecated `IPlatform` has been removed

## defaultValueTypes is no longer global

Previously, value types for `SharedMap`s were registered via calls to `registerDefaultValueType(type)`, which would add the type to a global collection.  This global has been replaced by a member on the extension, which can be set as a parameter to the `.getFactory()` method.  So for example, the following usage:

```typescript
registerDefaultValueType(new DistributedSetValueType());
registerDefaultValueType(new CounterValueType());
const mapExtension = SharedMap.getFactory();
```

Should change to the following:

```typescript
const mapValueTypes = [
    new DistributedSetValueType(),
    new CounterValueType(),
];
const mapExtension = SharedMap.getFactory(mapValueTypes);
```

You can also still register value types on a `SharedMap` itself via `map.registerValueType(type)` after it is created.

## ContainerRuntime registerRequestHandler passed into the constructor

Previously you would call something like this:

```javascript
const runtime = await ContainerRuntime.load(context, registry);
runtime.registerRequestHandler(async (request: IRequest) => {
    // Request Handling Logic
});
```

In `ContainerRuntime.load(...)` if we are loading from a snapshot we trigger the load of all the components. This means if any of the components call `request(...)` on the ContainerRuntime it will not be registered yet. By passing in a `createRequestHandler` we can set the requestHandler before we load any components.

Now:

```javascript
const createRequestHandler = (runtime: ContainerRuntime) => {
    return(async (request: IRequest) => {
        // Request Handling Logic
    });
};
const runtime = await ContainerRuntime.load(context, registry, createRequestHandler);
```

We use a factory so we can pass in the runtime after it has been created to be used in the request routing.

# 0.5 Breaking Changes (July 3, 2019)
Renamed the sharepoint driver files and class names in odsp-socket-storage. Deleted the previous implementation of odsp driver.

- [attach() on IChannel/ISharedObject is now register()](#attach-on-ichannelisharedobject-is-now-register)
- [Separate Create and Attach Component](#separate-create-and-attach-component)
- [Stream inheritance and Cell rename](#stream-inheritance-and-cell-rename)

## attach() on IChannel/ISharedObject is now register()

We always assumed that if you had a channel you were in a state that they could be attached. This is no longer true because of the Separate Create and Attach Component work (See below). Channels are tied to component runtime and if the runtime is not attached but you try to attach the channel bad things happen.

The `register()` call, instead of simply attaching, will register a channel with the underlying component runtime. If the runtime is already attached it will attach the channel. If the runtime is not attached it will queue the channel to be attached when the runtime is attached.

## Separate Create and Attach Component

There used to be only one method to add a component that was called `createAndAttachComponent`. The logic lived on the `ContainerRuntime` and the method was piped through the `IComponentContext` and also lived on the `ComponentRuntime`.

Now the `ContainerRuntime` consists of a `createComponent(id: string, pkg: string)` method. `createComponent` will produce and return a new `ComponentRuntime` based on the `id` and `pkg` provided. Creating a ComponentRuntime requires calling the `instantiateComponent` function on your factory. This code will be executed before returning the new `ComponentRuntime` object.

To attach a `ComponentRuntime` you need to call `attach()` on the `ComponentRuntime` directly. The framework guarantees that any channels `registered()`on the runtime when attach is called will be snapshotted and sent as a part of the original Attach OP (see above).

For compatibility there is still a `createAndAttachComponent` method on the `ComponentRuntime`. This method simply calls `createComponent` then calls `attach()` right away on that new component before returning.

## Stream inheritance and Cell rename

- Stream no longer inherit from SharedMap.   Create a separate SharedMap if needed. This also mean Stream snapshot format has changed
- class Cell is renamed SharedCell

# 0.4 Breaking Changes (June 17, 2019)

The IComponent in @prague/runtime-defintions and IPlatform in @prague/container-definitions have been deprecated and
will be removed in the next release.

They have been replaced with the IComponent inside of @prague/container-definitions.

All static methods have been changed from PascalCase to camelCase.

Deleted sharepoint-socket-storage package from drivers. Moved all files from sharepoint-socket-storage to odsp-socket-storage.

# 0.3 Breaking Changes (June 3, 2019)

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
### @prague/merge-tree Remove ISegment.getType() and SegmentType enum

We are trying to decouple merge tree from specific segment types, as
the segment types are defined by the sequence, like sharedstring.
So we've removed the centralized enum of segment types from mergeTree
and it's useage on ISegment.

```typescript
if(segment.getType() === SegmentType.Text){
    const text = segment as TextSegment
    ...
} else if(segment.getType() === SegmentType.Marker){
    const marker = segment as Marker
    ...
}

```
Becomes:

```typescript
if(TextSegment.Is(segment)) {
    // segment will now know it's a text segment
    // and can be used as such
    ...
}else if (Marker.is(segment)) {
    // segment will now know it's a marker
    // and can be used as such
    ...
}
```

### @prague/merge-tree Remove text specific functions from merge tree and move to SharedString

We are trying to decouple merge tree from specific segment types, as
the segment types are defined by the sequence, like sharedstring.
So we've moved all text specific method to shared string from client
and merge tree.

```typescript
sharedString.client.getTextAndMarkers("pg");
sharedString.client.getText();
```
Becomes:

```typescript
sharedString.getTextAndMarkers("pg");
sharedString.getText(start?, end?);
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
