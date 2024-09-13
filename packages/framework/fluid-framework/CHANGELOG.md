# fluid-framework

## 2.2.0

### Minor Changes

-   The PropertyManager class and related functions and properties are deprecated ([#22183](https://github.com/microsoft/FluidFramework/pull/22183)) [cbba69554f](https://github.com/microsoft/FluidFramework/commit/cbba69554fc5026f562f44683a902474fabd6e81)

    The `PropertyManager` class, along with the `propertyManager` properties and `addProperties` functions on segments and intervals, are not intended for external use.
    These elements will be removed in a future release for the following reasons:

    -   There are no scenarios where they need to be used directly.
    -   Using them directly will cause eventual consistency problems.
    -   Upcoming features will require modifications to these mechanisms.

-   Compile-time type narrowing based on a TreeNode's NodeKind ([#22222](https://github.com/microsoft/FluidFramework/pull/22222)) [4d3bc876ae](https://github.com/microsoft/FluidFramework/commit/4d3bc876ae32fa3f2568299e29246f6970e48ee0)

    `TreeNode`'s schema-aware APIs implement `WithType`, which now has a `NodeKind` parameter that can be used to narrow `TreeNode`s based on `NodeKind`.

    Example:

    ```typescript
    function getKeys(node: TreeNode & WithType<string, NodeKind.Array>): number[];
    function getKeys(node: TreeNode & WithType<string, NodeKind.Map | NodeKind.Object>): string[];
    function getKeys(node: TreeNode): string[] | number[];
    function getKeys(node: TreeNode): string[] | number[] {
    	const schema = Tree.schema(node);
    	switch (schema.kind) {
    		case NodeKind.Array: {
    			const arrayNode = node as TreeArrayNode;
    			const keys: number[] = [];
    			for (let index = 0; index < arrayNode.length; index++) {
    				keys.push(index);
    			}
    			return keys;
    		}
    		case NodeKind.Map:
    			return [...(node as TreeMapNode).keys()];
    		case NodeKind.Object:
    			return Object.keys(node);
    		default:
    			throw new Error("Unsupported Kind");
    	}
    }
    ```

-   ✨ New! `Record`-typed objects can now be used to construct MapNodes ([#22042](https://github.com/microsoft/FluidFramework/pull/22042)) [25deff344b](https://github.com/microsoft/FluidFramework/commit/25deff344b447380486c1efb64ed69177c32ddc5)

    You can now construct MapNodes from `Record` typed objects, similar to how maps are expressed in JSON.

    Before this change, an `Iterable<string, Child>` was required, but now an object like `{key1: Child1, key2: Child2}` is allowed.

    Full example using this new API:

    ```typescript
    class Schema extends schemaFactory.map("ExampleMap", schemaFactory.number) {}
    const fromRecord = new Schema({ x: 5 });
    ```

    This new feature makes it possible for schemas to construct a tree entirely from JSON-compatible objects using their constructors,
    as long as they do not require unhydrated nodes to differentiate ambiguous unions,
    or IFluidHandles (which themselves are not JSON compatible).

    Due to limitations of TypeScript and recursive types,
    recursive maps do not advertise support for this feature in their typing,
    but it works at runtime.

-   New SharedTree configuration option: `ITreeConfigurationOptions.preventAmbiguity` ([#22048](https://github.com/microsoft/FluidFramework/pull/22048)) [966906a034](https://github.com/microsoft/FluidFramework/commit/966906a03490daa5a914030b37342abb8267c12d)

    The new `ITreeConfigurationOptions.preventAmbiguity` flag can be set to true to enable checking of some additional rules when constructing the `TreeViewConfiguration`.

    This example shows an ambiguous schema:

    ```typescript
    const schemaFactory = new SchemaFactory("com.example");
    class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
    class Meters extends schemaFactory.object("Meters", { length: schemaFactory.number }) {}
    const config = new TreeViewConfiguration({
    	// This combination of schema can lead to ambiguous cases, and will error since preventAmbiguity is true.
    	schema: [Feet, Meters],
    	preventAmbiguity: true,
    });
    const view = tree.viewWith(config);
    // This is invalid since it is ambiguous which type of node is being constructed.
    // The error thrown above when constructing the TreeViewConfiguration is because of this ambiguous case:
    view.initialize({ length: 5 });
    ```

    See the documentation on `ITreeConfigurationOptions.preventAmbiguity` for a more complete example and more details.

-   `Tree.schema` now returns `TreeNodeSchema` ([#22185](https://github.com/microsoft/FluidFramework/pull/22185)) [bfe8310a94](https://github.com/microsoft/FluidFramework/commit/bfe8310a9406a8658c2fac8827c7114844c32234)

    The typing of `Tree.schema` has changed from:

    ```typescript
    schema<T extends TreeNode | TreeLeafValue>(node: T): TreeNodeSchema<string, NodeKind, unknown, T>;
    ```

    to:

    ```typescript
    schema(node: TreeNode | TreeLeafValue): TreeNodeSchema;
    ```

    The runtime behavior is unaffected: any code which worked and still compiles is fine and does not need changes.

    `Tree.schema` was changed to mitigate two different issues:

    1. It tried to give a more specific type based on the type of the passed in value.
       When the type of the input is not known precisely (for example it is a union of node types like `Foo | Bar`, or `TreeNode` or even `TreeNode | TreeLeafValue`), this was fine since schema are covariant over their node type.
       However when the input was more specific that the schema type, for example the type is simply `0`, this would result in unsound typing, since the create function could actually return values that did not conform with that schema (for example `schema.create(1)` for the number schema typed with `0` would return `1` with type `0`).
    2. The node type was provided to the incorrect type parameter of TreeNodeSchema.
       The `TNode` parameter is the third one, not the fourth.
       The fourth is `TBuild` which sets the input accepted to its create function or constructor.
       Thus this code accidentally left `TNode` unset (which is good due to the above issue), but invalidly set `TBuild`.
       `TBuild` is contravariant, so it has the opposite issue that setting `TNode` would have: if your input is simply typed as something general like `TreeNode`, then the returned schema would claim to be able to construct an instance given any `TreeNode`.
       This is incorrect, and this typing has been removed.

    Fortunately it should be rare for code to be impacted by this issue.
    Any code which manually specified a generic type parameter to `Tree.schema()` will break, as well as code which assigned its result to an overly specifically typed variable.
    Code which used `typeof` on the returned schema could also break, though there are few use-cases for this so such code is not expected to exist.
    Currently it's very difficult to invoke the create function or constructor associated with a `TreeNodeSchema` as doing so already requires narrowing to `TreeNodeSchemaClass` or `TreeNodeSchemaNonClass`.
    It is possible some such code exists which will need to have an explicit cast added because it happened to work with the more specific (but incorrect) constructor input type.

-   Recursive SharedTree schemas using MapNodes no longer produce invalid d.ts files ([#22106](https://github.com/microsoft/FluidFramework/pull/22106)) [554fc5a94e](https://github.com/microsoft/FluidFramework/commit/554fc5a94e57e2d109ea9008b7c64517c58a6b73)

    Consider a recursive SharedTree schema like the following, which follows all our recommended best practices:

    ```typescript
    export class RecursiveMap extends schema.mapRecursive("RM", [() => RecursiveMap]) {}
    {
    	type _check = ValidateRecursiveSchema<typeof RecursiveMap>;
    }
    ```

    This schema would work when used from within its compilation unit, but would generate d.ts that fails to compile when exporting it:

    ```typescript
    declare const RecursiveMap_base: import("@fluidframework/tree").TreeNodeSchemaClass<
    	"com.example.RM",
    	import("@fluidframework/tree").NodeKind.Map,
    	import("@fluidframework/tree").TreeMapNodeUnsafe<readonly [() => typeof RecursiveMap]> &
    		import("@fluidframework/tree").WithType<"com.example.RM">,
    	{
    		[Symbol.iterator](): Iterator<[string, RecursiveMap], any, undefined>;
    	},
    	false,
    	readonly [() => typeof RecursiveMap]
    >;
    export declare class RecursiveMap extends RecursiveMap_base {}
    ```

    This results in the compile error in TypeScript 5.4.5:

    > error TS2310: Type 'RecursiveMap' recursively references itself as a base type.

    With this change, that error is fixed by modifying the `TreeMapNodeUnsafe` type it references to inline the definition of `ReadonlyMap` instead of using the one from the TypeScript standard library.

-   ✨ New! When unambiguous, ArrayNodes can now be constructed from Maps and MapNodes from arrays ([#22036](https://github.com/microsoft/FluidFramework/pull/22036)) [25e74f9f3b](https://github.com/microsoft/FluidFramework/commit/25e74f9f3bed6e6ff041c088813c4cc1ea276b9c)

    Since the types for ArrayNodes and MapNodes indicate they can be constructed from iterables,
    it should work, even if those iterables are themselves arrays or maps.
    To avoid this being a breaking change, a priority system was introduced.
    ArrayNodes will only be implicitly constructable from JavaScript Map objects in contexts where no MapNodes are allowed.
    Similarly MapNodes will only be implicitly constructable from JavaScript Array objects in contexts where no ArrayNodes are allowed.

    In practice, the main case in which this is likely to matter is when implicitly constructing a map node. If you provide an array of key value pairs, this now works instead of erroring, as long as no ArrayNode is valid at that location in the tree.

    ```typescript
    class MyMapNode extends schemaFactory.map("x", schemaFactory.number) {}
    class Root extends schemaFactory.object("root", { data: MyMapNode }) {}
    // This now works (before it compiled, but error at runtime):
    const fromArray = new Root({ data: [["x", 5]] });
    ```

    Prior versions used to have to do:

    ```typescript
    new Root({ data: new MyMapNode([["x", 5]]) });
    ```

    or:

    ```typescript
    new Root({ data: new Map([["x", 5]]) });
    ```

    Both of these options still work: strictly more cases are allowed with this change.

-   Implicit TreeNode construction improvements ([#21995](https://github.com/microsoft/FluidFramework/pull/21995)) [977f96c1a0](https://github.com/microsoft/FluidFramework/commit/977f96c1a0dd1d5eb0dbcd087d07cb7510d533ea)

    ArrayNodes and MapNodes could always be explicitly constructed (using `new`) from iterables.
    The types also allowed using of iterables to implicitly construct array nodes and map nodes,
    but this did not work at runtime.
    This has been fixed for all cases except implicitly constructing an ArrayNode form an `Iterable` that is actually a `Map`,
    and implicitly constructing a MapNode from an `Iterable` that is actually an `Array`.
    These cases may be fixed in the future, but require additional work to ensure unions of array nodes and map nodes work correctly.

    Additionally MapNodes can now be constructed from `Iterator<readonly [string, content]>` where previously the inner arrays had to be mutable.

-   Enforce use of TreeViewConfiguration's constructor ([#22055](https://github.com/microsoft/FluidFramework/pull/22055)) [e8955579f6](https://github.com/microsoft/FluidFramework/commit/e8955579f6d52a6c7e300642088c60d6ed12d7db)

    `TreeViewConfiguration` is `@sealed`, meaning creating custom implementations of it such as assigning object literals to a `TreeViewConfiguration` or sub-classing it are not supported.
    This reserved the ability for the Fluid Framework to add members to this class over time, informing users that they must use it in such a way where such changes are non-breaking.
    However, there was no compiler-based enforcement of this expectation.
    It was only indicated via documentation and an implicit assumption that when an API takes in a typed defined as a class, that an instance of that class must be used rather than an arbitrary object of a similar shape.

    With this change, the TypeScript compiler will now inform users when they invalidly provide an object literal as a `TreeViewConfiguration`.

    More specifically this causes code like this to produce a compile error:

    ```typescript
    // Don't do this!
    const view = tree.viewWith({ schema: TestNode, enableSchemaValidation: false });
    ```

    The above was never intended to work, and is not a supported use of the `viewWith` since it requires a `TreeViewConfiguration` which is sealed.
    Any code using the above pattern will break in Fluid Framework 2.2 and above. Such code will need to be updated to the pattern shown below.
    Any code broken by this change is technically unsupported and only worked due to a gap in the type checking. This is not considered a breaking change.
    The correct way to get a `TreeViewConfiguration` is by using its constructor:

    ```typescript
    // This pattern correctly initializes default values and validates input.
    const view = tree.viewWith(new TreeViewConfiguration({ schema: TestNode }));
    ```

    Skipping the constructor causes the following problems:

    1. `TreeViewConfiguration` does validation in its constructor, so skipping it also skips the validation which leads to much less friendly error messages for invalid schema.
    2. Skipping the constructor also discards any default values for options like `enableSchemaValidation`.
       This means that code written in that style would break if more options were added. Since such changes are planned,
       it is not practical to support this pattern.

-   New `isFluidHandle` type guard to check if an object is an `IFluidHandle` ([#22029](https://github.com/microsoft/FluidFramework/pull/22029)) [7827d1040a](https://github.com/microsoft/FluidFramework/commit/7827d1040a9ebc0bd11388dc31f15370ea9f68d3)

    The `isFluidHandle` type guard function is now exported and can be used to detect which objects are `IFluidHandle`s.
    Since `IFluidHandle` often needs special handling (for example when serializing since it's not JSON compatible),
    having a dedicated detection function for it is useful.
    Doing this detection was possible previously using the `tree` package's schema system via `Tree.is(value, new SchemaFactory("").handle)`,
    but can now be done with just `isFluidHandle(value)`.

-   Add a function `isRepoSuperset` to determine if changes to a document schema are backward-compatible ([#22045](https://github.com/microsoft/FluidFramework/pull/22045)) [f6fdc95bb3](https://github.com/microsoft/FluidFramework/commit/f6fdc95bb36a892710bc315aae85fd2c75aec975)

    Note: These changes are not customer-facing and make progress toward future plans in Tree's schema evolution space.

## 2.1.0

### Minor Changes

-   Detect arrayNode iterator invalidation ([#21760](https://github.com/microsoft/FluidFramework/pull/21760)) [6fd320c385](https://github.com/microsoft/FluidFramework/commit/6fd320c38561e272a1acaf4248f47fc386c650e4)

    When `arrayNode`s are edited concurrently during iteration, an error will be thrown.

-   Some SharedDirectory/SharedMap-related APIs have been sealed ([#21836](https://github.com/microsoft/FluidFramework/pull/21836)) [b1d0427eab](https://github.com/microsoft/FluidFramework/commit/b1d0427eab3fcd55588dd80996967133db66f1b8)

    Note that this is a _documentation only change._ There is no runtime or type-level impact.

    Some top-level APIs within `@fluidframework/map` and `fluid-framework` have been updated to reflect their
    sealed/readonly nature. That is, they are not to be implemented externally to Fluid Framework and not changed. This was
    already the case, but the documentation was not clear.

    Updated APIs:

    -   [IDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/idirectory-interface) sealed
    -   [IDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryevents-interface) sealed
    -   [IDirectoryValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryvaluechanged-interface) sealed and path property is readonly
    -   [ISharedDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectory-interface) sealed
    -   [ISharedDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectoryevents-interface) sealed
    -   [IValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/ivaluechanged-interface) sealed

-   tree: Improved performance for accessing identifiers in shortId API ([#21944](https://github.com/microsoft/FluidFramework/pull/21944)) [6b4cf26d9c](https://github.com/microsoft/FluidFramework/commit/6b4cf26d9cc14c1a36cf07fd7408f1d1227e373a)

    Users should see improved performance when calling the `Tree.shortId` API. Identifier field keys are now cached in the schema for faster access.

-   ✨ New! Debug visualizers for TreeNodes in NodeJS and browsers ([#21895](https://github.com/microsoft/FluidFramework/pull/21895)) [0d197fefec](https://github.com/microsoft/FluidFramework/commit/0d197fefec852df2911151217ac1b71cde528a70)

    TreeNodes now have custom debug visualizers to improve the debug experience in NodeJS and in browsers. Note that custom formatters must be enabled in the browser developer tools for that visualizer to be used.

-   Using "delete" on tree fields now throws an error instead of not working correctly ([#21609](https://github.com/microsoft/FluidFramework/pull/21609)) [416849b1fd](https://github.com/microsoft/FluidFramework/commit/416849b1fda029870ee1c1742100de4f8dde45b7)

    TypeScript allows `delete` on object node optional fields if the `exactOptionalPropertyTypes` tsconfig setting is not
    enabled. This does not work correctly at runtime and now produces an informative error.

-   Improved error reporting ([#21940](https://github.com/microsoft/FluidFramework/pull/21940)) [3b8a366dd1](https://github.com/microsoft/FluidFramework/commit/3b8a366dd15660f9c916832040faf772534c0755)

    Several cases of invalid usage patterns for tree APIs have gained improved error reporting, as well as improved documentation on the APIs detailing what usage is supported.
    These improvements include:

    -   Unsupported usages of schema classes: using more than one schema class derived from a single SchemaFactory generated base class. This used to hit internal asserts, but now has a descriptive user-facing UsageError. Most of this work was done in [9fb3dcf](https://github.com/microsoft/FluidFramework/commit/9fb3dcf491a7f0d66f4abbdc64ab97ccabef4707).
    -   Improved detection of when prior exception may have left SharedTree in an invalid state.
        These cases now report a UsageError including a reference to the prior exception. This was mainly done in [9fb3dcf](https://github.com/microsoft/FluidFramework/commit/9fb3dcf491a7f0d66f4abbdc64ab97ccabef4707) and [b77d530](https://github.com/microsoft/FluidFramework/commit/b77d530b9252201c40a90d1a2a6315f76f1a4a4b).

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

-   fluid-framework: Remove some types from `@public` that are not needed ([#21326](https://github.com/microsoft/FluidFramework/pull/21326)) [b629cb80b0](https://github.com/microsoft/FluidFramework/commit/b629cb80b0e5ecdc750270807f77a0e30fab4559)

    Mark the following APIs `@alpha` instead of `@public`:

    -   IBranchOrigin
    -   ISequencedDocumentMessage
    -   ISignalMessage
    -   ISignalMessageBase
    -   ITrace

-   tree: A new tree status has been added for SharedTree nodes. ([#21270](https://github.com/microsoft/FluidFramework/pull/21270)) [8760e321b0](https://github.com/microsoft/FluidFramework/commit/8760e321b02177babfb187ae293a17a65723f249)

    `TreeStatus.Created` indicates that a SharedTree node has been constructed but not yet inserted into the tree.
    Constraints passed to the `runTransaction` API are now marked as `readonly`.

-   fluid-framework: Remove several types from `@public` scope ([#21142](https://github.com/microsoft/FluidFramework/pull/21142)) [983e9f09f7](https://github.com/microsoft/FluidFramework/commit/983e9f09f7b10fef9ffa1e9af86166f0ccda7e14)

    The following types have been moved from `@public` to `@alpha`:

    -   `IFluidSerializer`
    -   `ISharedObjectEvents`
    -   `IChannelServices`
    -   `IChannelStorageService`
    -   `IDeltaConnection`
    -   `IDeltaHandler`

    These should not be needed by users of the declarative API, which is what `@public` is targeting.

-   sequence: Stop ISharedString extending SharedObject ([#21067](https://github.com/microsoft/FluidFramework/pull/21067)) [47465f4b12](https://github.com/microsoft/FluidFramework/commit/47465f4b12056810112df30a6dad89282afc7a2d)

    ISharedString no longer extends SharedSegmentSequence and instead extends the new ISharedSegmentSequence, which may be missing some APIs.

    Attempt to migrate off the missing APIs, but if that is not practical, request they be added to ISharedSegmentSequence and cast to SharedSegmentSequence as a workaround temporally.

-   Update to ES 2022 ([#21292](https://github.com/microsoft/FluidFramework/pull/21292)) [68921502f7](https://github.com/microsoft/FluidFramework/commit/68921502f79b1833c4cd6d0fe339bfb126a712c7)

    Update tsconfig to target ES 2022.

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

-   tree: Breaking change: `TreeStatus.Created` is now `TreeStatus.New` ([#21278](https://github.com/microsoft/FluidFramework/pull/21278)) [5a26346a14](https://github.com/microsoft/FluidFramework/commit/5a26346a145ed54d08cd5a9b4f1c9b177711bd7c)

    `TreeStatus.Created` has been renamed to `TreeStatus.New`.

-   core-interfaces, tree: Unify `IDisposable` interfaces ([#21184](https://github.com/microsoft/FluidFramework/pull/21184)) [cfcb827851](https://github.com/microsoft/FluidFramework/commit/cfcb827851ffc81486db6c718380150189fb95c5)

    Public APIs in `@fluidframework/tree` now use `IDisposable` from `@fluidframework/core-interfaces` replacing `disposeSymbol` with "dispose".

    `IDisposable` in `@fluidframework/core-interfaces` is now `@sealed` indicating that third parties should not implement it to reserve the ability for Fluid Framework to extend it to include `Symbol.dispose` as a future non-breaking change.

-   fluid-framework: Cleanup `fluid-framework` legacy exports ([#21153](https://github.com/microsoft/FluidFramework/pull/21153)) [efee21c296](https://github.com/microsoft/FluidFramework/commit/efee21c2965a02288db6e0345fcf9b3713210953)

    Cleanup `fluid-framework` legacy exports to remove no longer required types.

## 2.0.0-rc.4.0.0

### Minor Changes

-   SharedString now uses ISharedObjectKind and does not export the factory [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Most users of `SharedString` should be unaffected as long as they stick to the factory patterns supported by ISharedObjectKind.
    If the actual class type is needed it can be found as `SharedStringClass`.

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

-   Minor API fixes for "@fluidframework/tree" package. [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Changes constructor for `FieldSchema` from public to private. Users should call `makeFieldSchema` to create instance of `FieldSchema`.

-   Make several driver types no longer public [b7ad7d0b55](https://github.com/microsoft/FluidFramework/commit/b7ad7d0b55884dd8954abf7c398e518838b9bda0)

    Move the following types from `@public` to `@alpha`:

    -   ITokenClaims
    -   IDocumentMessage
    -   IClientConfiguration
    -   IAnyDriverError
    -   IDriverErrorBase
    -   DriverErrorTypes

    `DriverErrorTypes` is no longer exported from the `fluid-framework` package.

-   Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id` [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client.
    2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR.

## 2.0.0-rc.3.0.0

### Major Changes

-   fluid-framework: DDS classes are no longer publicly exported [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    SharedDirectory now only exports its factory and the interface type.
    The actual concrete classes which leak implementation details are no longer exported.
    Users of the `SharedDirectory` type should use `ISharedDirectory`.

    Most of other internal crufts are also hided within the API surface, such as the encoded format,
    ILocalValue, ICreateInfo, local op metadata types, etc.

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

-   tree: Allow root editing and make TreeView parameterized over schema. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    TreeView now is parameterized over the field schema instead of the root field type. This was needed to infer the correct input type when reassigning the root.
    Code providing an explicit type to TreeView, like `TreeView<Foo>` can usually be updated by replacing that with `TreeView<typeof Foo>`.

-   fluid-framework: Replace SharedObjectClass with new ISharedObjectKind type. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    The static objects used as SharedObjectClass now explicitly implement the new ISharedObjectKind type.
    SharedObjectClass has been removed as ISharedObjectKind now fills that role.
    LoadableObjectCtor has been inlined as it only had one use: an external user of it can replace it with `(new (...args: any[]) => T)`.

-   fluid-framework: Moved SharedMap to 'fluid-framework/legacy' [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Please use SharedTree for new containers. SharedMap is supported for loading preexisting Fluid Framework 1.x containers only.

    Fluid Framework 1.x users migrating to Fluid Framework 2.x will need to import SharedMap from the './legacy' import path.

    ```ts
    import { SharedMap } from "fluid-framework/legacy";
    ```

-   fluid-framework: Make some interface members readonly [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Remove unneeded mutability from some interface members.

## 2.0.0-rc.2.0.0

### Minor Changes

-   fluid-framework: EventEmitterWithErrorHandling is no longer publicly exported ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    EventEmitterWithErrorHandling is intended for authoring DDSes, and thus is only intended for use within the Fluid Framework client packages.
    It is no longer publicly exported: any users should fine their own solution or be upstreamed.
    EventEmitterWithErrorHandling is available for now as `@alpha` to make this migration less disrupting for any existing users.

-   fluid-framework: SharedObject classes are no longer exported as public ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    `SharedObject` and `SharedObjectCore` are intended for authoring DDSes, and thus are only intended for use within the Fluid Framework client packages.
    They is no longer publicly exported: any users should fine their own solution or be upstreamed.
    `SharedObject` and `SharedObjectCore` are available for now as `@alpha` to make this migration less disrupting for any existing users.

-   API tightening ([#20012](https://github.com/microsoft/FluidFramework/issues/20012)) [049de899dd](https://github.com/microsoft/FluidFramework/commits/049de899ddfd5c0155251cb0ea00ecbe3a7f7665)

    The Fluid Framework API has been clarified with tags applied to package exports. As we are working toward a clear, safe,
    and stable API surface, some build settings and imports may need to be adjusted.

    **Now:** Most packages are specifying "exports" - import specifierss like` @fluidframework/foo/lib/internals` will
    become build errors. The fix is to use only public APIs from @fluidframework/foo.

    **Coming soon:** Build resolutions (`moduleResolution` in tsconfig compilerOptions) will need to be resolved with
    Node16, NodeNext, or a bundler that supports resolution of named import/export paths. Internally, some FF packages will
    use `@fluidframework/foo/internal` import paths that allow packages to talk to each other using non-public APIs.

    **Final stage:** APIs that are not tagged @public will be removed from @fluidframework/foo imports.

-   Deprecated error-related enums have been removed ([#19067](https://github.com/microsoft/FluidFramework/issues/19067)) [59793302e5](https://github.com/microsoft/FluidFramework/commits/59793302e56784cfb6ace0e6469345f3565b3312)

    Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
    deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
    `DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
    2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
    on the replacements.

-   map, tree: DDS classes are no longer publicly exported ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    SharedMap and SharedTree now only export their factories and the interface types.
    The actual concrete classes which leak implementation details are no longer exported.
    Users of the `SharedMap` type should use `ISharedMap`.
    Users of the `SharedTree` type should use `ISharedTree`.

-   tree: Minor API fixes for "@fluidframework/tree" package. ([#19057](https://github.com/microsoft/FluidFramework/issues/19057)) [3e0f218832](https://github.com/microsoft/FluidFramework/commits/3e0f21883255317f8bb1f7c420543650502a5b66)

    Rename `IterableTreeListContent` to `IterableTreeArrayContent`, inline `TreeMapNodeBase` into `TreeMapNode`, rename `TreeArrayNode.spread` to `TreeArrayNode.spread` and remove `create` which was not supposed to be public (use `TreeArrayNode.spread` instead).

-   fluid-framework: ContainerSchema is now readonly ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    The `ContainerSchema` type is intended for defining input to these packages. This should make the APIs more tolerant and
    thus be non-breaking, however its possible for some users of `ContainerSchema` to use it in ways where this could be a
    breaking change: any such users should remove their mutations and/or use a different type.

## 2.0.0-rc.1.0.0

Dependency updates only.

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

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   IntervalConflictResolver removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IntervalConflictResolver has been removed. Any lingering usages in application code can be removed as well. This change also marks APIs deprecated in #14318 as internal.

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

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
