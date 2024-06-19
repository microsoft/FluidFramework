# @fluidframework/tree

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

-   tree: Added support for optional schema validation on newly inserted content in SharedTree ([#21011](https://github.com/microsoft/FluidFramework/pull/21011)) [b14e9fa607](https://github.com/microsoft/FluidFramework/commit/b14e9fa607a8281f86d0cfac631e33ef12033e21)

    When defining how to view a SharedTree, an application can now specify that new content inserted into the tree should
    be subject to schema validation at the time it is inserted, so if it's not valid according to the stored schema in the
    tree an error is thrown immediately.

    This can be accomplished by passing an `ITreeConfigurationOptions` argument with `enableSchemaValidation` set to `true`
    when creating a `TreeConfiguration` to use with the SharedTree.

    Since this feature requires additional compute when inserting new content into the tree, it is not enabled by default.

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

-   tree: A new tree status has been added for SharedTree nodes. ([#21270](https://github.com/microsoft/FluidFramework/pull/21270)) [8760e321b0](https://github.com/microsoft/FluidFramework/commit/8760e321b02177babfb187ae293a17a65723f249)

    `TreeStatus.Created` indicates that a SharedTree node has been constructed but not yet inserted into the tree.
    Constraints passed to the `runTransaction` API are now marked as `readonly`.

-   tree: Adjusted Listenable multi-event subscription policy. ([#21244](https://github.com/microsoft/FluidFramework/pull/21244)) [a0c1d2c5b1](https://github.com/microsoft/FluidFramework/commit/a0c1d2c5b1e20f3dc469377c093649fc5eb8c3dd)

    `Listenable.on()` no longer supports the same listener function object being registered twice for the same event.
    The deregister function returned by `Listenable.on()` may now be called multiple times with no effect.

-   Update to ES 2022 ([#21292](https://github.com/microsoft/FluidFramework/pull/21292)) [68921502f7](https://github.com/microsoft/FluidFramework/commit/68921502f79b1833c4cd6d0fe339bfb126a712c7)

    Update tsconfig to target ES 2022.

-   tree: Event types have been renamed ([#21233](https://github.com/microsoft/FluidFramework/pull/21233)) [4d56fd1f99](https://github.com/microsoft/FluidFramework/commit/4d56fd1f99a25f34c69d1aed2b60fbe156fc068f)

    -   `ISubscribable` is renamed to `Listenable`.
    -   `IsEvent` type helper is renamed to `IsListener`.
    -   `Events` is renamed to `Listeners`.

-   tree: Move several types into InternalTypes ([#21482](https://github.com/microsoft/FluidFramework/pull/21482)) [64d49dd362](https://github.com/microsoft/FluidFramework/commit/64d49dd3629cefe6260a1d6223e58b10c2ac0cb6)

    The stable public API surface for Tree has been reduced.
    Several types have been moved into InternalTypes, indicating that they are not fully stable nor intended to be referenced by users of Tree.

    -   NodeBuilderData
    -   FieldHasDefault
    -   TreeNodeSchemaNonClass
    -   TreeArrayNodeBase
    -   ScopedSchemaName
    -   DefaultProvider
    -   typeNameSymbol
    -   InsertableObjectFromSchemaRecord
    -   ObjectFromSchemaRecord
    -   FieldHasDefaultUnsafe
    -   ObjectFromSchemaRecordUnsafe
    -   TreeObjectNodeUnsafe
    -   TreeFieldFromImplicitFieldUnsafe
    -   TreeNodeFromImplicitAllowedTypesUnsafe
    -   InsertableTreeNodeFromImplicitAllowedTypesUnsafe
    -   TreeArrayNodeUnsafe
    -   TreeMapNodeUnsafe
    -   InsertableObjectFromSchemaRecordUnsafe
    -   InsertableTreeFieldFromImplicitFieldUnsafe
    -   InsertableTypedNodeUnsafe
    -   NodeBuilderDataUnsafe
    -   NodeFromSchemaUnsafe
    -   FlexList
    -   TreeApi

    Additionally a few more types which could not be moved due to technically limitations have been documented that they should be treated similarly.

    -   TreeNodeApi
    -   TreeNodeSchemaCore
    -   All \*Unsafe type (use for construction of recursive schema).
    -   WithType
    -   AllowedTypes
    -   FieldSchemaUnsafe

    Also to reduce confusion `type` was renamed to `typeNameSymbol`, and is now only type exported. `Tree.is` should be used to get type information from `TreeNodes` instead.

-   tree: object node fields with statically known default values are now optional ([#21193](https://github.com/microsoft/FluidFramework/pull/21193)) [21eac41660](https://github.com/microsoft/FluidFramework/commit/21eac41660944208bad42b156d7df05fe6dc6b97)

    Makes object node fields with statically known default values (i.e., `optional` and `identifier` fields) optional when creating trees, where they were previously required.

    Example:

    ```typescript
    class Foo extends schemaFactory.object("Foo", {
    	name: schemaFactory.string,
    	id: schemaFactory.identifier,
    	nickname: schemaFactory.optional(schemaFactory.string),
    }) {}

    // Before
    const foo = new Foo({
    	name: "Bar",
    	id: undefined, // Had to explicitly specify `undefined` to opt into default behavior
    	nickname: undefined, // Had to explicitly specify `undefined` for optional field
    });

    // After
    const foo = new Foo({
    	name: "Bar",
    	// Can omit `id` and `nickname` fields, as both have statically known defaults!
    });
    ```

-   tree: Breaking change: Removed the `"afterBatch"` event from `Treeview` ([#21406](https://github.com/microsoft/FluidFramework/pull/21406)) [69aceb88e5](https://github.com/microsoft/FluidFramework/commit/69aceb88e525d7fb5c93aaa8328ce26a56e2d9cb)

    This event is no longer necessary.
    In the past, it provided a means for waiting for a batch of changes to finish applying to the tree before taking some action.
    However, the tree change events exposed via `Tree.on` wait for a batch to complete before firing, so the `"afterBatch"` event provides no additional guarantees.
    Listeners of this event who wish to respond to changes to the tree view can use `"rootChanged"` instead.

-   tree: Fix AfterBatch event ([#21162](https://github.com/microsoft/FluidFramework/pull/21162)) [cecd740a6c](https://github.com/microsoft/FluidFramework/commit/cecd740a6cadc6d3cdafdba7e22312b3d756c780)

    `TreeViewEvents.afterBatch` is now triggered when appropriate instead of never firing.

-   tree: Breaking change: `TreeStatus.Created` is now `TreeStatus.New` ([#21278](https://github.com/microsoft/FluidFramework/pull/21278)) [5a26346a14](https://github.com/microsoft/FluidFramework/commit/5a26346a145ed54d08cd5a9b4f1c9b177711bd7c)

    `TreeStatus.Created` has been renamed to `TreeStatus.New`.

-   tree: Implement compatibility-based schema evolution API ([#20815](https://github.com/microsoft/FluidFramework/pull/20815)) [64e5763b70](https://github.com/microsoft/FluidFramework/commit/64e5763b70e269418fbb77f75dbd3c82b91b1aff)

    This change adjusts some top-level APIs for using SharedTree to better accommodate applications that need to change their schema.
    These changes enable forwards compatibility with future work to relax `SharedTree`'s restrictions around view schema and stored schema compatibility.
    That future work will enable more flexible policies around how applications can update their documents' schemas over time.

    Application authors are encouraged to develop a compatibility policy which they are comfortable with using the guidance in the
    "Schema Evolvability" section of `@fluidframework/tree`'s readme.

    To make the details of schema compatibilities that SharedTree supports more clear,
    `TreeView.error` has been functionally replaced with the `compatibility` property.
    Users desiring the previous strict behavior should use `view.compatibility.isEquivalent` at appropriate places in application logic.

    # `ITree.schematize` removal

    `ITree.schematize` (and its argument `TreeConfiguration`) has been removed. Instead, call `ITree.viewWith` and provide it a `TreeViewConfiguration`.
    Unlike `schematize`, `viewWith` does not implicitly initialize the document.
    As such, it doesn't take an `initialTree` property.
    Instead, applications should initialize their trees in document creation codepaths using the added `TreeView.initialize` API.

    ## Old

    As an example, something like the following code may have been used before for both the document create and document load codepaths:

    ```typescript
    // -- fluid-framework API for statically defined objects in container schema --
    const tree = container.initialObjects.myTree;
    const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));

    // -- fluid-framework API for dynamically created objects --
    const tree = await container.create(SharedTree);
    const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));
    ```

    When using the encapsulated API, creating a tree looks a bit different but the call to `schematize` is the same:

    ```typescript
    // -- encapsulated API --
    const tree = SharedTree.create(runtime, "foo");
    const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));
    ```

    ## New

    After migrating this code away from `schematize` and onto `viewWith`, it would look like this on the create codepath:

    ```typescript
    const treeConfig = new TreeViewConfiguration({ schema: Point });

    // The following line reflects the first-party API (e.g. @fluidframework/aqueduct). If using the third-party API, obtaining
    // a SharedTree is unaffected by this changeset.
    const tree = SharedTree.create(runtime, "foo");
    const view = tree.viewWith(treeConfig);
    view.initialize(new Point({ x: 0, y: 0 }));
    ```

    and this on the load codepath:

    ```typescript
    // 'tree' would typically be obtained by retrieving it from a well-known location, e.g. within a `DataObject`'s
    // root directory or in `IFluidContainer.initialObjects`
    const view = tree.viewWith(treeConfig);
    ```

    Besides only making the initial tree required to specify in places that actually perform document initialization, this is beneficial for mutation semantics: `tree.viewWith` never modifies the state of the underlying tree.
    This means applications are free to attempt to view a document using multiple schemas (e.g. legacy versions of their document format) without worrying about altering the document state.

    If existing code used schematize in a context where it wasn't known whether the document needed to be initialized, you can leverage `TreeView.compatibility` like so:

    ```typescript
    const view = tree.viewWith(config);
    if (view.compatibility.canInitialize) {
    	view.initialize(initialTree);
    }
    ```

    # Separate `schemaChanged` event on `TreeView`

    The previous `rootChanged` event was called whenever the root was invalidated, which happens on changes to the document schema
    as well as changes to the root field (i.e. usage of `TreeView.root`'s setter on a local client, or acking such a change made by
    a remote client).

    There was no distinct `schemaChanged` event, meaning that any time the root changed,
    clients would have needed to check the `error` state on `TreeView` to see if the document's underlying schema had been changed.

    Now, the latter case of the document's underlying schema changing has been split off into a `schemaChanged` event, which will
    fire before `rootChanged`.
    This should allow applications to run slightly less compatibility logic to routine changes to the root field.

-   core-interfaces, tree: Unify `IDisposable` interfaces ([#21184](https://github.com/microsoft/FluidFramework/pull/21184)) [cfcb827851](https://github.com/microsoft/FluidFramework/commit/cfcb827851ffc81486db6c718380150189fb95c5)

    Public APIs in `@fluidframework/tree` now use `IDisposable` from `@fluidframework/core-interfaces` replacing `disposeSymbol` with "dispose".

    `IDisposable` in `@fluidframework/core-interfaces` is now `@sealed` indicating that third parties should not implement it to reserve the ability for Fluid Framework to extend it to include `Symbol.dispose` as a future non-breaking change.

-   tree: Fix bug where reading tree during events could cause issues ([#21172](https://github.com/microsoft/FluidFramework/pull/21172)) [81a648a984](https://github.com/microsoft/FluidFramework/commit/81a648a9843f7940df318b63258d864d1fa91bc1)

    Reading the tree inside of NodeChange and TreeChange events could corrupt internal memory structures leading to invalid data in subsequence reads as well as internal errors being thrown. This bug has been fixed.

## 2.0.0-rc.4.0.0

### Minor Changes

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

-   Minor API fixes for "@fluidframework/tree" package. [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Changes constructor for `FieldSchema` from public to private. Users should call `makeFieldSchema` to create instance of `FieldSchema`.

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

-   Better events [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    We have updated the Events to make it easier to create granular event listeners for single nodes and better support the
    undo/redo feature. SharedTree nodes now expose `nodeChanged` and `treeChanged` events that fire in response to changes
    in the node, and to changes in the subtree rooted at the node, respectively.

    This change was originally made in [#20286](https://github.com/microsoft/FluidFramework/pull/20286) ([ac1e773960](https://github.com/microsoft/FluidFramework/commit/ac1e7739607551abb0dae7fa74dda56aec94b609)).

    [Read more about SharedTree Events at fluidframework.com](https://fluidframework.com/docs/data-structures/tree/#event-handling)

-   Recursive schemas [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Schemas are even more powerful now with the added support for recursive types, which allows you to define types that
    reference nodes of the same type in their subtree.

    Users of the beta APIs via `SchemaFactoryRecursive` can now find them on `SchemaFactory`.

    [Read more about Recursive Schema at fluidframework.com](https://fluidframework.com/docs/data-structures/tree/#recursive-schema)

-   Transactions [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    You can group multiple changes such that they are applied atomically, and if they fail, they fail atomically. As a
    result of grouping changes in a transaction, you also get a single revertible object making it easier to undo and redo.

    [Read more about Transactions at fluidframework.com](https://fluidframework.com/docs/data-structures/tree/#transactions)

-   tree: Empty optional fields on object nodes now are undefined non-enumerable own properties instead of not a property at all. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Empty optional fields on object nodes now are now undefined non-enumerable own properties.
    This improves behavior in cases where they shadow inherited members which no longer have types which differ from the runtime behavior.

-   tree: Allow root editing and make TreeView parameterized over schema. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    TreeView now is parameterized over the field schema instead of the root field type. This was needed to infer the correct input type when reassigning the root.
    Code providing an explicit type to TreeView, like `TreeView<Foo>` can usually be updated by replacing that with `TreeView<typeof Foo>`.

-   fluid-framework: Replace SharedObjectClass with new ISharedObjectKind type. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    The static objects used as SharedObjectClass now explicitly implement the new ISharedObjectKind type.
    SharedObjectClass has been removed as ISharedObjectKind now fills that role.
    LoadableObjectCtor has been inlined as it only had one use: an external user of it can replace it with `(new (...args: any[]) => T)`.

-   Undo/Redo [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Added the ability to listen for changes and track revertible objects on your undo/redo stacks. Revertibles allow you to
    undo and redo changes even if other changes have been made in remote clients.

    [Read more about Undo/redo at fluidframework.com](https://fluidframework.com/docs/data-structures/tree/#undoredo-support)

## 2.0.0-rc.2.0.0

### Minor Changes

-   map, tree: DDS classes are no longer publicly exported ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    SharedMap and SharedTree now only export their factories and the interface types.
    The actual concrete classes which leak implementation details are no longer exported.
    Users of the `SharedMap` type should use `ISharedMap`.
    Users of the `SharedTree` type should use `ISharedTree`.

-   tree: Minor API fixes for "@fluidframework/tree" package. ([#19057](https://github.com/microsoft/FluidFramework/issues/19057)) [3e0f218832](https://github.com/microsoft/FluidFramework/commits/3e0f21883255317f8bb1f7c420543650502a5b66)

    Rename `IterableTreeListContent` to `IterableTreeArrayContent`, inline `TreeMapNodeBase` into `TreeMapNode`, rename `TreeArrayNode.spread` to `TreeArrayNode.spread` and remove `create` which was not supposed to be public (use `TreeArrayNode.spread` instead).

## 2.0.0-rc.1.0.0

### Major Changes

-   @fluid-experimental/tree2 package renamed ([#18851](https://github.com/microsoft/FluidFramework/issues/18851)) [6161193ffe](https://github.com/microsoft/FluidFramework/commits/6161193ffe661c3835c4f1ba2da78078dca10b4b)

    The package is now `@fluidframework/tree`.

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

-   datastore-definitions: Jsonable and Serializable now require a generic parameter [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `Jsonable` and `Serializable` types from @fluidframework/datastore-definitions now require a generic parameter and
    if that type is `any` or `unknown`will return a new result `JsonableTypeWith<>` that more accurately represents the
    limitation of serialization.

    Additional modifications:

    -   `Jsonable`'s `TReplacement` parameter default has also been changed from `void` to `never`, which now disallows
        `void`.
    -   Unrecognized primitive types like `symbol` are now filtered to `never` instead of `{}`.
    -   Recursive types with arrays (`[]`) are now supported.

    `Serializable` is commonly used for DDS values and now requires more precision when using them. For example SharedMatrix
    (unqualified) has an `any` default that meant values were `Serializable<any>` (i.e. `any`), but now `Serializable<any>`
    is `JsonableTypeWith<IFluidHandle>` which may be problematic for reading or writing. Preferred correction is to specify
    the value type but casting through `any` may provide a quick fix.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

### Minor Changes

-   Rename SchemaCollection.treeSchema to nodeSchema ([#18067](https://github.com/microsoft/FluidFramework/issues/18067)) [be7ee4b383](https://github.com/microsoft/FluidFramework/commits/be7ee4b383c86fbcb60e92b606bbd305d0157acb)

    This breaks all existing documents, as well as any users of SchemaCollection.treeSchema.

-   Remove editable-tree-1 ([#18169](https://github.com/microsoft/FluidFramework/issues/18169)) [f0100204bd](https://github.com/microsoft/FluidFramework/commits/f0100204bd19f8be769a1163a655a185e7c1289e)

    Remove editable-tree-1 and APIs related to it. Users must migrate to editable-tree-2.

## 2.0.0-internal.7.2.0

### Minor Changes

-   tree2: Rename DocumentSchema and toDocumentSchema ([#17854](https://github.com/microsoft/FluidFramework/issues/17854)) [0b5944050d](https://github.com/microsoft/FluidFramework/commits/0b5944050d3bc4470a87de4a4332235d37cb719c)

    The following APIs have been renamed:

    -   `DocumentSchema` is now `TreeSchema`
    -   `toDocumentSchema` is now `intoSchema`

-   tree2: Rename SchemaData, FieldSchema, and FieldStoredSchema ([#17888](https://github.com/microsoft/FluidFramework/issues/17888)) [27f5a5e24d](https://github.com/microsoft/FluidFramework/commits/27f5a5e24dda81eafe5678742d68cd7d8afdc060)

    The following APIs have been renamed:

    -   `SchemaData` is now `TreeStoredSchema`
    -   `FieldSchema` is now `TreeFieldSchema`
    -   `FieldStoredSchema` is now `TreeFieldStoredSchema`

-   tree2: Add `null` to allowed leaf types ([#17781](https://github.com/microsoft/FluidFramework/issues/17781)) [040e28f3ab](https://github.com/microsoft/FluidFramework/commits/040e28f3aba415e086fe2661e97d984c97b85045)

    Replaced the jsonNull schema with a new null leaf schema, and added support for leaf values which are null.

-   tree2: Rename TreeSchema ([#17845](https://github.com/microsoft/FluidFramework/issues/17845)) [908ee8921e](https://github.com/microsoft/FluidFramework/commits/908ee8921eb8d7fc21f64eee88a12c678e9756dd)

    The following APIs have been renamed:

    -   `TreeSchema` is now `TreeNodeSchema`

-   tree2: Rename Struct ([#17899](https://github.com/microsoft/FluidFramework/issues/17899)) [d90af254fe](https://github.com/microsoft/FluidFramework/commits/d90af254fe4224dd6391908e88055f3c98cc1d18)

    The following APIs have been renamed:

    -   `Struct` is now `ObjectNode`

## 2.0.0-internal.7.1.0

### Major Changes

-   tree2: Regressions and new node removal model ([#17304](https://github.com/microsoft/FluidFramework/issues/17304)) [935bae84a5](https://github.com/microsoft/FluidFramework/commits/935bae84a513c7184025784e485ad64d23514f92)

    Regression 1: All changes are atomized by the `visitDelta` function. This means that, if you insert/remove/move 2 contiguous nodes, the `visitDelta` function will call the `DeltaVisitor` twice (once for each node) instead of once for both nodes. Anything that sits downstream from the `DeltaVisitor` will therefore also see those changes as atomized.

    Regression 2: The forest never forgets removed content so the memory will grow unbounded.

    Removed nodes are preserved as detached in the forest instead of deleted. Anchors to removed nodes remain valid.

    Change notification for node replacement in optional and required fields are now atomic.

    Updated `PathVisitor` API.

    Forest and AnchorSet are now updated in lockstep.

### Minor Changes

-   tree2: Allow ImplicitFieldSchema for non-recursive schema building ([#17683](https://github.com/microsoft/FluidFramework/issues/17683)) [c11e1ce593](https://github.com/microsoft/FluidFramework/commits/c11e1ce59310c820117d06e4065bf42bed6b823d)

    SchemaBuilder now accepts `ImplicitFieldSchema` in many places which used to require `FieldSchema`.
    This allows `Required` fields to be implicitly specified from just their AllowedTypes.
    Additionally in these cases the AllowedTypes can be implicitly specified from a single `Any` or `TreeSchema`.

-   Remove SchemaBuilder.leaf ([#17773](https://github.com/microsoft/FluidFramework/issues/17773)) [674565130f](https://github.com/microsoft/FluidFramework/commits/674565130ffdcf8d23dae858273b303d123587c4)

    Custom schema should use the predefined leaf domain, or wrap its leaf types instead of defining new leaf schema.

-   tree2: Forest summaries now include detached fields ([#17391](https://github.com/microsoft/FluidFramework/issues/17391)) [5b6bc74ca8](https://github.com/microsoft/FluidFramework/commits/5b6bc74ca85470783c6f48c061385f128f4fc6f9)

    Forest summaries now include detached fields. This breaks existing documents.

-   tree2: Rename "Value" Multiplicity and FieldKind ([#17622](https://github.com/microsoft/FluidFramework/issues/17622)) [bb68aeb30c](https://github.com/microsoft/FluidFramework/commits/bb68aeb30cfb3d4e0e82f04f1771ad4cb69e23af)

    `Multiplicity.Value` has been renamed to `Multiplicity.Single` and `FieldKinds.value` has been renamed to `FieldKinds.required`.

-   tree2: SharedTreeFactory type changed ([#17588](https://github.com/microsoft/FluidFramework/issues/17588)) [7ebe2b7a79](https://github.com/microsoft/FluidFramework/commits/7ebe2b7a7962e4b9a87c305cc48ffc00b1e57583)

    The 'type' field for @fluid-experimental/tree2's exported `IChannelFactory`s has been changed to not overlap with @fluid-experimental/tree's channel type.
    This breaks existing tree2 documents: upon loading them, an error with message "Channel Factory SharedTree not registered" will be thrown.
    If using the typed-tree API, the message will instead be "Channel Factory SharedTree:<subtype> not registered" where <subtype> is the subtype used by
    the application when constructing their `TypedTreeFactory`.

    Applications which want to support such documents could add an explicit registry entry to their `ISharedObjectRegistry` which maps the type shown in the error message to a factory producing @fluid-experimental/tree2.

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

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

### Minor Changes

-   tree2: Replace ValueSchema.Serializable with FluidHandle ([#17306](https://github.com/microsoft/FluidFramework/issues/17306)) [99b1f7192e](https://github.com/microsoft/FluidFramework/commits/99b1f7192ec9fed19e2a76d9251c3fd123ae90e0)

    Replace ValueSchema.Serializable with FluidHandle, removing support for arbitrary objects as tree values and preventing "any" type from Serializable from infecting TreeValue.

-   tree2: Restrict struct field names to avoid collisions with schema2 names ([#17089](https://github.com/microsoft/FluidFramework/issues/17089)) [8f8294188f](https://github.com/microsoft/FluidFramework/commits/8f8294188f554e6cc708d6cbbde4ea1dd2e52728)

    Struct field names are now restricted to avoid collisions with schema2 names.

## 2.0.0-internal.6.3.0

### Minor Changes

-   Decouple Forest and Schema. ([#17139](https://github.com/microsoft/FluidFramework/issues/17139)) [c6b69f5c19](https://github.com/microsoft/FluidFramework/commits/c6b69f5c1957ceda7bebe6a31a570b49505e298b)

    Forest no longer exports the schema, nor invalidates when schema changes.

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

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

### Minor Changes

-   Remove support for Global Fields ([#16546](https://github.com/microsoft/FluidFramework/issues/16546)) [cade66e2fd](https://github.com/microsoft/FluidFramework/commits/cade66e2fd55e92109e337ad1801e8751000c2bf)

    Support for Global fields has been removed.

-   Old SchemaBuilder APIs removed ([#16373](https://github.com/microsoft/FluidFramework/issues/16373)) [38bcf98635](https://github.com/microsoft/FluidFramework/commits/38bcf98635f35c4e0994798e18ae62389da2a773)

    Remove old SchemaBuilder APIs in favor of Schema2 design.

## 2.0.0-internal.5.3.0

### Minor Changes

-   Move closeAndGetPendingLocalState to IContainerExperimental ([#16302](https://github.com/microsoft/FluidFramework/issues/16302)) [93151af787](https://github.com/microsoft/FluidFramework/commits/93151af787b76e547cf3460df47f81832131db8c)

    This change deprecates the experimental method closeAndGetPendingLocalState on IContainer and moves it to IContainerExperimental.
    IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
    Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate on and finalize our experimental features.
    Experimental features should not be used in production environments.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

### Major Changes

-   Renamed from `@fluid-internal/tree` to `@fluid-experimental/tree2` so that this package will be included in releases for experimental use.

### Minor Changes

-   Op compression is enabled by default ([#14856](https://github.com/microsoft/FluidFramework/pull-requests/14856)) [439c21f31f](https://github.com/microsoft/FluidFramework/commits/439c21f31f4a3ea6515f01d2b2be7f35c04910ce)

    If the size of a batch is larger than 614kb, the ops will be compressed. After upgrading to this version, if batches exceed the size threshold, the runtime will produce a new type of op with the compression properties. To open a document which contains this type of op, the client's runtime version needs to be at least `client_v2.0.0-internal.2.3.0`. Older clients will close with assert `0x3ce` ("Runtime message of unknown type") and will not be able to open the documents until they upgrade. To minimize the risk, it is recommended to audit existing session and ensure that at least 99.9% of them are using a runtime version equal or greater than `client_v2.0.0-internal.2.3.0`, before upgrading to `2.0.0-internal.4.1.0`.

    More information about op compression can be found
    [here](./packages/runtime/container-runtime/src/opLifecycle/README.md).

-   @fluidframework/garbage-collector deprecated ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

    The `@fluidframework/garbage-collector` package is deprecated with the following functions, interfaces, and types in it.
    These are internal implementation details and have been deprecated for public use. They will be removed in an upcoming
    release.

    -   `cloneGCData`
    -   `concatGarbageCollectionData`
    -   `concatGarbageCollectionStates`
    -   `GCDataBuilder`
    -   `getGCDataFromSnapshot`
    -   `IGCResult`
    -   `removeRouteFromAllNodes`
    -   `runGarbageCollection`
    -   `trimLeadingAndTrailingSlashes`
    -   `trimLeadingSlashes`
    -   `trimTrailingSlashes`
    -   `unpackChildNodesGCDetails`
    -   `unpackChildNodesUsedRoutes`
