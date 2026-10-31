/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { type RestrictiveStringRecord, compareSets, getOrCreate } from "../../util/index.js";
import { normalizeAllowedTypes } from "../core/index.js";
import type {
	NodeKind,
	WithType,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
	TreeNodeSchemaBoth,
	ImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
} from "../core/index.js";
import {
	FieldKind,
	type FieldSchema,
	type ImplicitFieldSchema,
	// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep API report references named FieldProps rather than FieldProps_2.
	type FieldProps,
	// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep API report references named FieldPropsAlpha rather than FieldPropsAlpha_2.
	type FieldPropsAlpha,
	// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep API report references named FieldSchemaAlpha rather than FieldSchemaAlpha_2.
	type FieldSchemaAlpha,
	createFieldSchema,
} from "../fieldSchema.js";
// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep API report references named LeafSchema rather than LeafSchema_2.
import type { LeafSchema } from "../leafNodeSchema.js";
import {
	arraySchema,
	type MapNodeInsertableData,
	mapSchema,
	objectSchema,
	type TreeArrayNode,
	type InsertableObjectFromSchemaRecord,
	type TreeMapNode,
	type TreeObjectNode,
	type ArrayNodeCustomizableSchemaAlpha,
	type MapNodeCustomizableSchema,
	type ObjectNodeSchema,
	type ObjectNodeSchemaWorkaround,
	type RecordNodeCustomizableSchema,
	type RecordNodeInsertableData,
	type TreeRecordNode,
	recordSchema,
} from "../node-kinds/index.js";
import type {
	SchemaType,
	SimpleObjectNodeSchema,
	// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep API report references named SimpleLeafNodeSchema rather than SimpleLeafNodeSchema_2.
	SimpleLeafNodeSchema,
} from "../simpleSchema.js";

import { defaultIdentifierProvider } from "./identifierDefaultProvider.js";
import { schemaStaticsAlpha } from "./schemaFactoryAlpha.js";
import { schemaStaticsBeta } from "./schemaFactoryBeta.js";
import {
	defaultSchemaFactoryObjectOptions,
	type NodeSchemaOptions,
	type NodeSchemaOptionsAlpha,
	type ObjectSchemaOptions,
	type ObjectSchemaOptionsBeta,
	type ObjectSchemaOptionsAlpha,
	type SchemaFactoryAlphaOptions,
	type SchemaFactoryBetaOptions,
} from "./schemaFactoryOptions.js";
import { scoped, structuralName, type ScopedSchemaName } from "./schemaFactoryUtils.js";
import { SchemaFactory_base, schemaStatics } from "./schemaStatics.js";
import type {
	ArrayNodeCustomizableSchemaUnsafe,
	// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars -- Keep inferred return types named to preserve API report indentation.
	FieldSchemaAlphaUnsafe,
	InsertableObjectFromSchemaRecordAlphaUnsafe,
	MapNodeCustomizableSchemaUnsafe,
	System_Unsafe,
	TreeRecordNodeUnsafe,
} from "./typesUnsafe.js";

export {
	defaultSchemaFactoryObjectOptions,
	type NodeSchemaOptions,
	type NodeSchemaOptionsAlpha,
	type ObjectSchemaOptions,
	type ObjectSchemaOptionsBeta,
	type ObjectSchemaOptionsAlpha,
} from "./schemaFactoryOptions.js";
export {
	schemaFromValue,
	scoped,
	structuralName,
	type ScopedSchemaName,
} from "./schemaFactoryUtils.js";
export { SchemaFactory_base } from "./schemaStatics.js";

// TODO:
// SchemaFactory.array references should link to the correct overloads, however the syntax for this does not seems to work currently for methods unless the they are not qualified with the class.
// API-Extractor requires such links to be qualified with the class, so it can't work.
// Since linking the overload set as a whole also doesn't work, these have been made non-links for now.
/**
 * Creates various types of {@link TreeNodeSchema|schema} for {@link TreeNode}s.
 *
 * @typeParam TScope - Scope added as a prefix to the name of every schema produced by this factory.
 * @typeParam TName - Type of names used to identify each schema produced in this factory.
 * Typically this is just `string` but it is also possible to use `string` or `number` based enums if you prefer to identify your types that way.
 *
 * @remarks
 * For details related to inputting data constrained by schema (including via assignment), and how non-exact schema types are handled in general refer to {@link Input}.
 * For information about recursive schema support, see methods postfixed with "recursive" and {@link ValidateRecursiveSchema}.
 * To apply schema defined with this factory to a tree, see {@link TreeViewConfiguration} and {@link ViewableTree.viewWith}.
 * See the {@link https://fluidframework.com/docs/data-structures/tree/schema-evolution | documentation on schema evolution} for how to handle changes to schema over time.
 *
 * All schemas produced by this factory get a {@link TreeNodeSchemaCore.identifier|unique identifier} by combining the {@link SchemaFactory.scope} with the schema's `Name`.
 * The `Name` part may be explicitly provided as a parameter, or inferred as a structural combination of the provided types.
 * The APIs which use this second approach, structural naming, also deduplicate all equivalent calls.
 * Therefore two calls to `array(allowedTypes)` with the same allowedTypes will return the same {@link TreeNodeSchema} instance.
 * On the other hand, two calls to `array(name, allowedTypes)` will always return different {@link TreeNodeSchema} instances
 * and it is an error to use both in the same tree (since their identifiers are not unique).
 *
 * For "customizable" schema (those which can be subclassed to customize them, see details below) some additional rules must be followed:
 *
 * 1. Only a single {@link TreeNodeSchema|schema} can be used from the class hierarchy deriving from the base class produced by this factory.
 * It is legal to subclass the returned class, and even subclass that class,
 * but only a single class from that class hierarchy can ever be instantiated or passed to any API as a {@link TreeNodeSchema|schema}.
 * These base classes can be used with `instanceof`, but not with schema based APIs like `Tree.is`.
 *
 * 2. If overriding the constructor, the constructor must accept the same argument as the base constructor `super` and forward it to `super` unchanged.
 *
 * 3. Properties for fields defined in the schema should not be overridden.
 *
 * 4. Additional static members added to schema should pick relatively unique keys to reduce the risk of colliding with implementation details what are not exposed in the API.
 *
 * 5. If exporting the schema from a package which uses API-Extractor, export the base class and derived class separately to work around {@link https://github.com/microsoft/rushstack/issues/4429 | a known limitation}.
 *
 * Note:
 * POJO stands for Plain Old JavaScript Object.
 * This means an object that works like a `{}` style object literal.
 * In this case it means the prototype is `Object.prototype` and acts like a set of key value pairs (data, not methods).
 * The usage below generalizes this to include array and map like objects as well.
 *
 * There are two ways to use these APIs:
 *
 * Customizable Approach:
 *
 * 1. Declaration: `class X extends schemaFactory.object("x", {}) {}`
 *
 * 2. Allows adding "local" (non-persisted) members: additional members (including methods) can be added to the class.
 *
 * 3. Prototype: The user-defined class.
 *
 * 4. Structurally named Schema: Not Supported.
 *
 * 5. Explicitly named Objects: Supported.
 *
 * 6. Explicitly named Maps and Arrays: Supported: Both declaration approaches can be used.
 *
 * 7. Node.js `assert.deepEqual`: Compares like class instances: equal to other nodes of the same type with the same content, including custom local fields.
 *
 * 8. IntelliSense: Shows and links to user-defined class by name: `X`.
 *
 * 9. Recursion: Supported with special declaration patterns.
 *
 * POJO Emulation Approach:
 *
 * 1. Declaration: `const X = schemaFactory.object("x", {}); type X = NodeFromSchema<typeof X>;`
 *
 * 2. Does not allow adding "local" (non-persisted) members: attempting to set non-field members will result in an error.
 *
 * 3. Prototype: `Object.prototype`, `Map.prototype`, or `Array.prototype` depending on node kind.
 *
 * 4. Structurally named Schema: Supported.
 *
 * 5. Explicitly named Objects: Supported.
 *
 * 6. Explicitly named Maps and Arrays: Not Supported.
 *
 * 7. Node.js `assert.deepEqual`: Compares like plain objects: equal to plain JavaScript objects with the same fields, and other nodes with the same fields, even if the types are different.
 *
 * 8. IntelliSense: Shows internal type generation logic: `object & TreeNode & ObjectFromSchemaRecord<{}> & WithType<"test.x">`.
 *
 * 9. Recursion: Unsupported: {@link https://github.com/microsoft/TypeScript/issues/55832 | Generated `.d.ts` files replace recursive references with `any`},
 * breaking the use of recursive schema across compilation boundaries.
 *
 * Note that while "POJO Emulation" nodes act a lot like POJO objects, they are not true POJO objects:
 *
 * - Adding new arbitrary fields will error, as well some cases of invalid edits.
 *
 * - They are implemented using proxies.
 *
 * - They have state that is not exposed via enumerable own properties, including a {@link TreeNodeSchema}.
 * This makes libraries like node.js `assert.deepEqual` fail to detect differences in type.
 *
 * - Assigning members has side effects (in this case editing the persisted/shared tree).
 *
 * - Not all operations implied by the prototype will work correctly: stick to the APIs explicitly declared in the TypeScript types.
 *
 * @privateRemarks
 * It's perfectly possible to make `POJO Emulation` mode (or even just hiding the prototype) selectable even when using the custom user class declaration syntax.
 * When doing this, it's still possible to make `instanceof` perform correctly.
 * Allowing (or banning) custom/out-of-schema properties on the class is also possible in both modes: it could be orthogonal.
 * Also for consistency, if keeping the current approach to detecting `POJO Emulation` mode it might make sense to make explicitly named Maps and Arrays do the detection the same as how object does it.
 *
 * Note: the comparison between the customizable and POJO modes is not done in a table because TSDoc does not currently have support for embedded markdown.
 *
 * @see {@link SchemaFactoryAlpha}
 * @see {@link SchemaFactoryBeta}
 * @sealed @public
 */
export class SchemaFactory<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory_base {
	/**
	 * TODO:
	 * If users of this generate the same name because two different schemas with the same identifier were used,
	 * the second use can get a cache hit, and reference the wrong schema.
	 * Such usage should probably return a distinct type or error but currently does not.
	 * The use of markSchemaMostDerived in structuralName at least ensure an error in the case where the collision is from two types extending the same schema factor class.
	 */
	private readonly structuralTypes: Map<string, TreeNodeSchema> = new Map();

	/**
	 * Construct a SchemaFactory with a given {@link SchemaFactory.scope|scope}.
	 * @remarks
	 * There are no restrictions on mixing schemas from different schema factories.
	 * Typically each library will create one or more SchemaFactories and use them to define its schema.
	 */
	public constructor(
		/**
		 * Prefix appended to the identifiers of all {@link TreeNodeSchema} produced by this builder.
		 *
		 * @remarks
		 * Generally each independently developed library
		 * (possibly a package, but could also be part of a package or multiple packages developed together)
		 * should get its own unique `scope`.
		 * Then each schema in the library get a name which is unique within the library.
		 * The scope and name are joined (with a period) to form the {@link TreeNodeSchemaCore.identifier|schema identifier}.
		 * Following this pattern allows a single application to depend on multiple libraries which define their own schema, and use them together in a single tree without risk of collisions.
		 * If a library logically contains sub-libraries with their own schema, they can be given a scope nested inside the parent scope, such as "ParentScope.ChildScope".
		 *
		 * To avoid collisions between the scopes of libraries
		 * it is recommended that the libraries use {@link https://en.wikipedia.org/wiki/Reverse_domain_name_notation | Reverse domain name notation} or a UUIDv4 for their scope.
		 * If this pattern is followed, application can safely use third party libraries without risk of the schema in them colliding.
		 *
		 * You may opt out of using a scope by passing `undefined`, but note that this increases the risk of collisions.
		 *
		 * @example
		 * Fluid Framework follows this pattern, placing the schema for the built in leaf types in the `com.fluidframework.leaf` scope.
		 * If Fluid Framework publishes more schema in the future, they would be under some other `com.fluidframework` scope.
		 * This ensures that any schema defined by any other library will not conflict with Fluid Framework's schema
		 * as long as the library uses the recommended patterns for how to scope its schema..
		 *
		 * @example
		 * A library could generate a random UUIDv4, like `242c4397-49ed-47e6-8dd0-d5c3bc31778b` and use that as the scope.
		 * Note: do not use this UUID: a new one must be randomly generated when needed to ensure collision resistance.
		 * ```typescript
		 * const factory = new SchemaFactory("242c4397-49ed-47e6-8dd0-d5c3bc31778b");
		 * ```
		 */
		public readonly scope: TScope,
	) {
		super();
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
	 * @param options - Additional options for the schema.
	 */
	public object<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
	>(
		name: Name,
		fields: T,
		options?: ObjectSchemaOptions,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T
	> {
		return objectSchema(scoped(this, name), fields, true, {
			...defaultSchemaFactoryObjectOptions,
			...options,
		}) as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
			object & InsertableObjectFromSchemaRecord<T>,
			true,
			T
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @param allowedTypes - The types that may appear as values in the map.
	 *
	 * @remarks
	 * The unique identifier for this Map is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named maps, other types in this schema builder should avoid names of the form `Map<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyMap = factory.map(factory.number);
	 * type MyMap = NodeFromSchema<typeof MyMap>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", {myMap: factory.map(factory.number)});
	 * ```
	 * @privateRemarks
	 * See note on array.
	 */
	public map<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaNonClass<
		ScopedSchemaName<TScope, `Map<${string}>`>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, `Map<${string}>`>, NodeKind.Map>,
		MapNodeInsertableData<T>,
		true,
		T,
		undefined
	>;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear as values in the map.
	 *
	 * @example
	 * ```typescript
	 * class NamedMap extends factory.map("name", factory.number) {}
	 * ```
	 */
	public map<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Map>,
		MapNodeInsertableData<T>,
		true,
		T,
		undefined
	>;

	/**
	 * {@link SchemaFactory.map} implementation.
	 *
	 * @privateRemarks
	 * This should return `TreeNodeSchemaBoth`, however TypeScript gives an error if one of the overloads implicitly up-casts the return type of the implementation.
	 * This seems like a TypeScript bug getting variance backwards for overload return types since it's erroring when the relation between the overload
	 * and the implementation is type safe, and forcing an unsafe typing instead.
	 */
	public map<const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchema<string, NodeKind.Map, TreeMapNode<T>, MapNodeInsertableData<T>, true, T> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Map", types);
			debugAssert(() => options === undefined || "No options for structural types");
			return this.getStructuralType(fullName, types, () =>
				this.namedMap(fullName, nameOrAllowedTypes as T, false, true, {}),
			) as TreeNodeSchemaBoth<
				string,
				NodeKind.Map,
				TreeMapNode<T>,
				MapNodeInsertableData<T>,
				true,
				T,
				undefined,
				TCustomMetadata
			>;
		}
		// To actually have type safety, assign to the type this method should return before implicitly up-casting when returning.
		const out: TreeNodeSchemaBoth<
			string,
			NodeKind.Map,
			TreeMapNode<T>,
			MapNodeInsertableData<T>,
			true,
			T,
			undefined,
			TCustomMetadata
		> = this.namedMap(nameOrAllowedTypes as TName, allowedTypes, true, true, options ?? {});
		return out;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeMapNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 */
	private namedMap<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
		options: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaBoth<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Map,
		TreeMapNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Map>,
		MapNodeInsertableData<T>,
		ImplicitlyConstructable,
		T,
		undefined,
		TCustomMetadata
	> {
		return mapSchema(
			scoped(this, name),
			allowedTypes,
			implicitlyConstructable,
			// The current policy is customizable nodes don't get fake prototypes.
			!customizable,
			options ?? {},
		);
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param allowedTypes - The types that may appear in the array.
	 *
	 * @remarks
	 * The identifier for this Array is defined as a function of the provided types.
	 * It is still scoped to this SchemaFactory, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named arrays, other types in this schema builder should avoid names of the form `Array<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyArray = factory.array(factory.number);
	 * type MyArray = NodeFromSchema<typeof MyArray>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", {myArray: factory.array(factory.number)});
	 * ```
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal, since TypeScript's structural types will allow assignment between runtime incompatible types at compile time.
	 * For example attempts to narrow unions of structural arrays by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its the type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls o this different subclasses)
	 * when working with structural typing.
	 *
	 * {@label STRUCTURAL}
	 */
	public array<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaNonClass<
		ScopedSchemaName<TScope, `Array<${string}>`>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, `Array<${string}>`>, NodeKind.Array>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T,
		undefined
	>;

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the array.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.array("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public array<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Array>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T,
		undefined
	>;

	/**
	 * {@link SchemaFactory.array} implementation.
	 *
	 * @privateRemarks
	 * This should return TreeNodeSchemaBoth: see note on "map" implementation for details.
	 */
	public array<const T extends ImplicitAllowedTypes, const TCustomMetadata = unknown>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchema<
		ScopedSchemaName<TScope, string>,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true,
		T,
		TCustomMetadata
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Array", types);
			debugAssert(() => options === undefined || "No options for structural types");
			return this.getStructuralType(fullName, types, () =>
				this.namedArray(fullName, nameOrAllowedTypes as T, false, true, {}),
			) as TreeNodeSchemaClass<
				ScopedSchemaName<TScope, string>,
				NodeKind.Array,
				TreeArrayNode<T>,
				Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
				true,
				T,
				undefined,
				TCustomMetadata
			>;
		}

		const out: TreeNodeSchemaBoth<
			ScopedSchemaName<TScope, string>,
			NodeKind.Array,
			TreeArrayNode<T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			true,
			T,
			undefined,
			TCustomMetadata
		> = this.namedArray(nameOrAllowedTypes as TName, allowedTypes, true, true, options ?? {});
		return out;
	}

	/**
	 * Retrieves or creates a structural {@link TreeNodeSchema} with the specified name and types.
	 *
	 * @param fullName - The name for the structural schema.
	 * @param types - The input schema(s) used to define the structural schema.
	 * @param builder - A function that builds the schema if it does not already exist.
	 * @returns The structural {@link TreeNodeSchema} associated with the given name and types.
	 * @throws `UsageError` if a schema structurally named schema with the same name is cached in `structuralTypes` but had different input types.
	 */
	protected getStructuralType(
		fullName: string,
		types: TreeNodeSchema | readonly TreeNodeSchema[],
		builder: () => TreeNodeSchema,
	): TreeNodeSchema {
		const structural = getOrCreate(this.structuralTypes, fullName, builder);
		const inputTypes = new Set(normalizeAllowedTypes(types));
		const outputTypes = new Set(
			normalizeAllowedTypes(structural.info as TreeNodeSchema | readonly TreeNodeSchema[]),
		);
		// If our cached value had a different set of types then were requested, the user must have caused a collision.
		const same = compareSets({ a: inputTypes, b: outputTypes });
		if (!same) {
			throw new UsageError(
				`Structurally named schema collision: two schemas named "${fullName}" were defined with different input schemas.`,
			);
		}
		return structural;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `array` which takes a name instead.
	 * This is only public to work around a compiler limitation.
	 */
	private namedArray<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
		options: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaBoth<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<ScopedSchemaName<TScope, string>, NodeKind.Array>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable,
		T,
		undefined,
		TCustomMetadata
	> {
		return arraySchema(
			scoped(this, name),
			allowedTypes,
			implicitlyConstructable,
			customizable,
			options,
		);
	}

	/**
	 * A special readonly field which holds an identifier string for an object node.
	 * @remarks
	 * The value of this field, a "node identifier", is a string which identifies a node (or nodes) among all nodes in the tree.
	 * Node identifiers are strings, and can therefore be used as lookup keys in maps or written to a database.
	 * When the node is constructed, the identifier field does not need to be specified.
	 * When an identifier is not provided, the SharedTree will generate an identifier for the node automatically.
	 * The identifier generated by the SharedTree has the following properties:
	 *
	 * - It is a UUID which will not collide with other generated UUIDs.
	 *
	 * - It is compressed to a space-efficient representation when stored in the document.
	 * Reading the identifier before inserting the node into a tree prevents the identifier from being stored in its compressed form,
	 * resulting in a larger storage footprint.
	 *
	 * - A compressed form of the identifier can be accessed at runtime via the {@link TreeNodeApi.shortId|Tree.shortId()} API.
	 *
	 * However, a user may alternatively supply their own string as the identifier if desired (for example, if importing identifiers from another system).
	 * In that case, if the user requires it to be unique, it is up to them to ensure uniqueness.
	 * User-supplied identifiers may be read immediately, even before insertion into the tree.
	 *
	 * A node may have more than one identifier field (though note that this precludes the use of the {@link TreeNodeApi.shortId|Tree.shortId()} API).
	 */
	public get identifier(): FieldSchema<FieldKind.Identifier, typeof this.string> {
		return createFieldSchema(FieldKind.Identifier, this.string, {
			defaultProvider: defaultIdentifierProvider,
		});
	}

	/**
	 * {@link SchemaFactory.object} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaFactory.object} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 *
	 * Additionally `ImplicitlyConstructable` is disabled (forcing use of constructor) to avoid
	 * `error TS2589: Type instantiation is excessively deep and possibly infinite.`
	 * which otherwise gets reported at sometimes incorrect source locations that vary based on incremental builds.
	 *
	 * @param options - Additional options for the schema.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptions,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T
	> {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.object(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T
		>;
	}

	/**
	 * `SchemaFactory.array` except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.array` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 * See also {@link FixRecursiveArraySchema} for additional information specific to recursive arrays schema exports.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public arrayRecursive<
		const Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	>(name: Name, allowedTypes: T) {
		const RecursiveArray = this.namedArray(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
			{},
		);

		return RecursiveArray as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			System_Unsafe.TreeArrayNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Array>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<
					System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>
				>;
			},
			false,
			T,
			undefined
		>;
	}

	/**
	 * `SchemaFactory.map` except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.map` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public mapRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	>(name: Name, allowedTypes: T) {
		const MapSchema = this.namedMap(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			// Setting this (implicitlyConstructable) to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			false,
			{},
		);

		return MapSchema as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			System_Unsafe.TreeMapNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Map>,
			| {
					/**
					 * Iterator for the iterable of content for this node.
					 * @privateRemarks
					 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
					 * the following compile error when declaring the recursive schema:
					 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
					 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
					 *
					 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
					 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
					 */
					[Symbol.iterator](): Iterator<
						[string, System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
					>;
			  }
			// Ideally this would be
			// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
			// but doing so breaks recursive types.
			// Instead we do a less nice version:
			| {
					readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			  },
			false,
			T,
			undefined
		>;
	}
}

/**
 * {@link SchemaFactory} with additional beta APIs.
 * @beta
 * @privateRemarks
 */
export class SchemaFactoryBeta<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * This property stores factory options without the {@link SchemaFactory.scope | scope}.
	 *
	 * @remarks
	 * Use {@link composeSchemaFactoryBetaOptions} with
	 * {@link SchemaFactoryBeta.(createDerivedFactory:1)} to extend these options.
	 */
	public readonly settings: SchemaFactoryBetaOptions;

	/**
	 * Creates a schema factory with optional defaults for object schemas.
	 *
	 * @param scopeOrOptions - The scope, or an options object that includes the scope.
	 */
	public constructor(
		scopeOrOptions: TScope | (SchemaFactoryBetaOptions & { readonly scope: TScope }),
	) {
		super(typeof scopeOrOptions === "object" ? scopeOrOptions.scope : scopeOrOptions);
		this.settings =
			typeof scopeOrOptions === "object"
				? { objectOptions: scopeOrOptions.objectOptions }
				: {};
	}

	/**
	 * {@inheritDoc SchemaStaticsBeta.staged}
	 */
	public static staged = schemaStaticsBeta.staged;

	/**
	 * {@inheritDoc SchemaStaticsBeta.staged}
	 */
	public staged = schemaStaticsBeta.staged;

	/**
	 * {@inheritDoc SchemaStaticsBeta.stagedRecursive}
	 */
	public static stagedRecursive = schemaStaticsBeta.stagedRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.stagedRecursive}
	 */
	public stagedRecursive = schemaStaticsBeta.stagedRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.types}
	 */
	public static types = schemaStaticsBeta.types;

	/**
	 * {@inheritDoc SchemaStaticsBeta.types}
	 */
	public types = schemaStaticsBeta.types;

	/**
	 * {@inheritDoc SchemaStaticsBeta.typesRecursive}
	 */
	public static typesRecursive = schemaStaticsBeta.typesRecursive;

	/**
	 * {@inheritDoc SchemaStaticsBeta.typesRecursive}
	 */
	public typesRecursive = schemaStaticsBeta.typesRecursive;

	/**
	 * Creates a {@link SchemaFactoryBeta} with a {@link SchemaFactory.scope|scope} which is a
	 * combination of this factory's scope and the provided name.
	 *
	 * @param name - The name to append to this factory's scope.
	 *
	 * @typeParam T - The name appended to this factory's scope.
	 * @typeParam TNameInner - The names allowed in the child factory.
	 *
	 * @returns A factory with the child scope and this factory's settings.
	 *
	 * @remarks
	 * The main use-case for this is when creating a collection of related schemas (for example
	 * using a function that creates multiple schemas).
	 * Creating such related schema using a sub-scope helps ensure they won't collide with other
	 * schema in the parent scope.
	 *
	 * The returned factory inherits this factory's {@link SchemaFactoryBeta.settings}.
	 */
	public scopedFactory<const T extends TName, TNameInner extends number | string = string>(
		name: T,
	): SchemaFactoryBeta<ScopedSchemaName<TScope, T>, TNameInner> {
		return this.createDerivedFactory<T, TNameInner>(undefined, name);
	}

	/**
	 * Creates a factory with the same scope and optional replacement settings.
	 *
	 * @param settings - The replacement settings, or `undefined` to inherit this factory's settings.
	 *
	 * @returns A new factory with the same scope.
	 *
	 * @remarks
	 * This does not change the original factory.
	 * The returned factory preserves the alpha or beta APIs of this factory.
	 * Use {@link composeSchemaFactoryBetaOptions} with this factory's
	 * {@link SchemaFactoryBeta.settings} to extend the existing settings.
	 */
	public createDerivedFactory(
		settings?: SchemaFactoryBetaOptions,
	): SchemaFactoryBeta<TScope, TName>;

	/**
	 * Creates a factory with a child scope and optional replacement settings.
	 *
	 * @param settings - The replacement settings, or `undefined` to inherit this factory's settings.
	 * @param name - The name to append to this factory's scope.
	 *
	 * @typeParam T - The name appended to this factory's scope.
	 * @typeParam TNameInner - The names allowed in the child factory.
	 *
	 * @returns A new factory with the child scope and the provided or inherited settings.
	 *
	 * @remarks
	 * This does not change the original factory.
	 * The returned factory preserves the alpha or beta APIs of this factory.
	 */
	public createDerivedFactory<
		const T extends TName,
		TNameInner extends number | string = string,
	>(
		settings: SchemaFactoryBetaOptions | undefined,
		name: T,
	): SchemaFactoryBeta<ScopedSchemaName<TScope, T>, TNameInner>;
	public createDerivedFactory(
		settings: SchemaFactoryBetaOptions = this.settings,
		name?: TName,
	): SchemaFactoryBeta<string | undefined, number | string> {
		return new SchemaFactoryBeta({
			scope: name === undefined ? this.scope : scoped<TScope, TName, TName>(this, name),
			objectOptions: settings.objectOptions,
		});
	}

	/**
	 * Defines a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - The schema identifier within this factory's scope.
	 * @param fields - The schemas for the object's fields.
	 * @param options - The per-call options passed to {@link SchemaFactoryBetaOptions.objectOptions}.
	 * The callback combines these options with the factory's defaults and controls which values take precedence.
	 *
	 * @remarks
	 * {@link SchemaFactoryBetaOptions.objectOptions} can provide factory-wide defaults.
	 */
	public override object<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: ObjectSchemaOptionsBeta<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T,
		never,
		TCustomMetadata
	> {
		const resolvedOptions = this.settings.objectOptions?.(name, fields, options) ?? options;
		return objectSchema(scoped<TScope, TName, Name>(this, name), fields, true, {
			...defaultSchemaFactoryObjectOptions,
			...resolvedOptions,
		}) as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeObjectNode<T, ScopedSchemaName<TScope, Name>>,
			object & InsertableObjectFromSchemaRecord<T>,
			true,
			T,
			never,
			TCustomMetadata
		>;
	}

	/**
	 * Defines a recursive {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - The schema identifier within this factory's scope.
	 * @param t - The schemas for the object's fields.
	 * @param options - The per-call options passed to {@link SchemaFactoryBetaOptions.objectOptions}.
	 * The callback combines these options with the factory's defaults and controls which values take precedence.
	 *
	 * @remarks
	 * See {@link SchemaFactory.objectRecursive} for recursive-schema requirements.
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsBeta<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.object(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param allowedTypes - The types that may appear in the record.
	 *
	 * @remarks
	 * The identifier for this record is defined as a function of the provided types.
	 * It is still scoped to this `SchemaFactory`, but multiple calls with the same arguments will return the same
	 * schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named records, other types in this schema builder should avoid names of the form `Record<${string}>`.
	 *
	 * The underlying data format for `Record` nodes is the same as that for `Map` nodes.
	 * Therefore, changing an existing `Map` schema to a `Record` schema (or vice versa) is
	 * a non-breaking change and does not require schema migration.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyRecord = factory.record(factory.number);
	 * type MyRecord = NodeFromSchema<typeof Record>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", { myRecord: factory.record(factory.number) });
	 * ```
	 *
	 * @privateRemarks
	 * The name produced at the type-level here is not as specific as it could be; however, doing type-level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal, since TypeScript's structural types will allow assignment between runtime incompatible types at compile time.
	 * For example, attempts to narrow unions of structural records by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls to this different subclasses)
	 * when working with structural typing.
	 *
	 * {@label STRUCTURAL}
	 */
	public record<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaNonClass<
		/* Name */ ScopedSchemaName<TScope, `Record<${string}>`>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, `Record<${string}>`>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	>;

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 * @param options - Additional options for the schema.
	 *
	 * @remarks
	 * The underlying data format for `Record` nodes is the same as that for `Map` nodes.
	 * Therefore, changing an existing `Map` schema to a `Record` schema (or vice versa) is
	 * a non-breaking change and does not require schema migration.
	 *
	 * Like TypeScript `Record`s, record nodes have some potential pitfalls.
	 * For example: TypeScript makes assumptions about built-in keys being present (e.g. `toString`, `hasOwnProperty`, etc.).
	 * Since these are otherwise valid keys in a record, this can lead to unexpected behavior.
	 * To prevent inconsistent behavior, these built-ins are hidden by record nodes.
	 * This means that if you try to call these built-ins (e.g. `toString()`) on a record node, you will get an error.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.record("name", factory.number) {}
	 * ```
	 *
	 * {@label NAMED}
	 */
	public record<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> & WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T,
		/* TConstructorExtra */ undefined,
		/* TCustomMetadata */ TCustomMetadata
	>;

	/**
	 * {@link SchemaFactoryBeta.record} implementation.
	 *
	 * @privateRemarks
	 * This should return {@link TreeNodeSchemaBoth}: see note on {@link SchemaFactory.map} implementation for details.
	 */
	public record<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		maybeAllowedTypes?: T,
		options?: NodeSchemaOptions,
	): TreeNodeSchema<
		/* Name */ ScopedSchemaName<TScope, string>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ true,
		/* Info */ T
	> {
		if (maybeAllowedTypes === undefined) {
			const nodeTypes = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Record", nodeTypes);
			return this.getStructuralType(fullName, nodeTypes, () =>
				this.namedRecord(
					fullName,
					nameOrAllowedTypes as T,
					/* customizable */ false,
					/* implicitlyConstructable */ true,
				),
			) as TreeNodeSchemaClass<
				/* Name */ ScopedSchemaName<TScope, string>,
				/* Kind */ NodeKind.Record,
				/* TNode */ TreeRecordNode<T>,
				/* TInsertable */ RecordNodeInsertableData<T>,
				/* ImplicitlyConstructable */ true,
				/* Info */ T,
				/* TConstructorExtra */ undefined
			>;
		}
		const out: TreeNodeSchemaBoth<
			/* Name */ ScopedSchemaName<TScope, string>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNode<T>,
			/* TInsertable */ RecordNodeInsertableData<T>,
			/* ImplicitlyConstructable */ true,
			/* Info */ T,
			/* TConstructorExtra */ undefined
		> = this.namedRecord(
			nameOrAllowedTypes as TName,
			maybeAllowedTypes,
			/* customizable */ true,
			/* implicitlyConstructable */ true,
			options,
		);
		return out;
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `record` which takes a name instead.
	 */
	private namedRecord<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
		options?: NodeSchemaOptions<TCustomMetadata>,
	): TreeNodeSchemaBoth<
		/* Name */ ScopedSchemaName<TScope, Name>,
		/* Kind */ NodeKind.Record,
		/* TNode */ TreeRecordNode<T> &
			WithType<ScopedSchemaName<TScope, string>, NodeKind.Record>,
		/* TInsertable */ RecordNodeInsertableData<T>,
		/* ImplicitlyConstructable */ ImplicitlyConstructable,
		/* Info */ T,
		/* TConstructorExtra */ undefined
	> {
		return recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable,
			implicitlyConstructable,
			nodeOptions: options,
		});
	}

	/**
	 * {@link SchemaFactoryBeta.(record:2)} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.record` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptions<TCustomMetadata>) {
		const RecordSchema = this.namedRecord(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			/* customizable */ true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			/* implicitlyConstructable */ false,
			options,
		);

		return RecordSchema as TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
			/* TInsertable */ {
				// Ideally this would be
				// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
				// but doing so breaks recursive types.
				// Instead we do a less nice version:
				readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			},
			/* ImplicitlyConstructable */ false,
			/* Info */ T,
			/* TConstructorExtra */ undefined,
			/* TCustomMetadata */ TCustomMetadata
		>;
	}
}

/**
 * {@link SchemaFactory} with additional alpha APIs.
 *
 * @alpha
 * @privateRemarks
 * When building schema, when `options` is not provided, `TCustomMetadata` is inferred as `unknown`.
 * If desired, this could be made to infer `undefined` instead by adding overloads for everything,
 * but currently it is not worth the maintenance overhead as there is no use case which this is known to be helpful for.
 */
export class SchemaFactoryAlpha<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactoryBeta<TScope, TName> {
	/**
	 * This property stores factory options without the {@link SchemaFactory.scope | scope}.
	 *
	 * @remarks
	 * Use {@link composeSchemaFactoryAlphaOptions} with
	 * {@link SchemaFactoryAlpha.(createDerivedFactory:1)} to extend these options.
	 */
	public override readonly settings: SchemaFactoryAlphaOptions;

	/**
	 * Creates a schema factory with optional defaults for object schemas.
	 *
	 * @param scopeOrOptions - The scope, or an options object that includes the scope.
	 */
	public constructor(
		scopeOrOptions: TScope | (SchemaFactoryAlphaOptions & { readonly scope: TScope }),
	) {
		super(scopeOrOptions);
		this.settings =
			typeof scopeOrOptions === "object"
				? { objectOptions: scopeOrOptions.objectOptions }
				: {};
	}

	/**
	 * Defines a {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - The schema identifier within this factory's scope.
	 * @param fields - The schemas for the object's fields.
	 * @param options - The per-call options passed to {@link SchemaFactoryAlphaOptions.objectOptions}.
	 * The callback combines these options with the factory's defaults and controls which values take precedence.
	 *
	 * @remarks
	 * {@link SchemaFactoryAlphaOptions.objectOptions} can provide factory-wide defaults.
	 */
	public objectAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		fields: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): ObjectNodeSchemaWorkaround<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		const resolvedOptions = this.settings.objectOptions?.(name, fields, options) ?? options;
		return objectSchema(scoped<TScope, TName, Name>(this, name), fields, true, {
			...defaultSchemaFactoryObjectOptions,
			...resolvedOptions,
		});
	}

	/**
	 * Defines a recursive {@link TreeNodeSchemaClass} for a {@link TreeObjectNode}.
	 *
	 * @param name - The schema identifier within this factory's scope.
	 * @param t - The schemas for the object's fields.
	 * @param options - The per-call options passed to {@link SchemaFactoryAlphaOptions.objectOptions}.
	 * The callback combines these options with the factory's defaults and controls which values take precedence.
	 *
	 * @remarks
	 * See {@link SchemaFactory.objectRecursive} for recursive-schema requirements.
	 */
	public override objectRecursive<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> &
		SimpleObjectNodeSchema<SchemaType.View, TCustomMetadata> &
		// We can't just use non generic `ObjectNodeSchema` here since "Base constructors must all have the same return type".
		// We also can't just use generic `ObjectNodeSchema` here and not `TreeNodeSchemaClass` since that doesn't work with unsafe recursive types.
		// ObjectNodeSchema<
		// 	ScopedSchemaName<TScope, Name>,
		// 	//  T & RestrictiveStringRecord<ImplicitFieldSchema> would be nice to use here, but it breaks the recursive type self references.
		// 	RestrictiveStringRecord<ImplicitFieldSchema>,
		// 	false,
		// 	TCustomMetadata
		// >
		Pick<ObjectNodeSchema, "fields"> {
		// TODO: syntax highting is vs code is broken here. Don't trust it. Use the compiler instead.
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.objectAlpha(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & System_Unsafe.InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		> &
			ObjectNodeSchema<
				ScopedSchemaName<TScope, Name>,
				RestrictiveStringRecord<ImplicitFieldSchema>,
				false,
				TCustomMetadata
			>;
	}

	/**
	 * Alpha version of {@link SchemaFactory.objectRecursive} that supports field defaults via {@link SchemaStaticsAlpha.withDefaultRecursive}.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 *
	 * @param name - The schema identifier within this factory's scope.
	 * @param t - The schemas for the object's fields.
	 * @param options - The per-call options passed to {@link SchemaFactoryAlphaOptions.objectOptions}.
	 * The callback combines these options with the factory's defaults and controls which values take precedence.
	 *
	 * @remarks
	 * Use this instead of {@link SchemaFactory.objectRecursive} when fields use {@link SchemaStaticsAlpha.withDefaultRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	public objectRecursiveAlpha<
		const Name extends TName,
		const T extends RestrictiveStringRecord<System_Unsafe.ImplicitFieldSchemaUnsafe>,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		t: T,
		options?: ObjectSchemaOptionsAlpha<TCustomMetadata>,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		System_Unsafe.TreeObjectNodeUnsafe<T, ScopedSchemaName<TScope, Name>>,
		object & InsertableObjectFromSchemaRecordAlphaUnsafe<T>,
		false,
		T,
		never,
		TCustomMetadata
	> &
		SimpleObjectNodeSchema<SchemaType.View, TCustomMetadata> &
		Pick<ObjectNodeSchema, "fields"> {
		type TScopedName = ScopedSchemaName<TScope, Name>;
		return this.objectAlpha(
			name,
			t as T & RestrictiveStringRecord<ImplicitFieldSchema>,
			options,
		) as unknown as TreeNodeSchemaClass<
			TScopedName,
			NodeKind.Object,
			System_Unsafe.TreeObjectNodeUnsafe<T, TScopedName>,
			object & InsertableObjectFromSchemaRecordAlphaUnsafe<T>,
			false,
			T,
			never,
			TCustomMetadata
		> &
			ObjectNodeSchema<
				ScopedSchemaName<TScope, Name>,
				RestrictiveStringRecord<ImplicitFieldSchema>,
				false,
				TCustomMetadata
			>;
	}

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public static override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public static override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public static override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public static override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public static override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * Like {@link SchemaFactory.identifier} but static and a factory function that can be provided {@link FieldProps}.
	 */
	public static readonly identifier = schemaStatics.identifier;

	/**
	 * {@inheritDoc SchemaStatics.leaves}
	 */
	public override readonly leaves = schemaStatics.leaves;

	/**
	 * {@inheritDoc SchemaStatics.optional}
	 */
	public override readonly optional = schemaStatics.optional;

	/**
	 * {@inheritDoc SchemaStatics.required}
	 */
	public override readonly required = schemaStatics.required;

	/**
	 * {@inheritDoc SchemaStatics.optionalRecursive}
	 */
	public override readonly optionalRecursive = schemaStatics.optionalRecursive;

	/**
	 * {@inheritDoc SchemaStatics.requiredRecursive}
	 */
	public override readonly requiredRecursive = schemaStatics.requiredRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public readonly withDefault = schemaStaticsAlpha.withDefault;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public static readonly withDefault = schemaStaticsAlpha.withDefault;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public readonly withDefaultRecursive = schemaStaticsAlpha.withDefaultRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.withDefault}
	 */
	public static readonly withDefaultRecursive = schemaStaticsAlpha.withDefaultRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.stagedOptional}
	 */
	public readonly stagedOptional = schemaStaticsAlpha.stagedOptional;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.stagedOptional}
	 */
	public static readonly stagedOptional = schemaStaticsAlpha.stagedOptional;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.stagedOptionalRecursive}
	 */
	public readonly stagedOptionalRecursive = schemaStaticsAlpha.stagedOptionalRecursive;

	/**
	 * {@inheritdoc SchemaStaticsAlpha.stagedOptionalRecursive}
	 */
	public static readonly stagedOptionalRecursive = schemaStaticsAlpha.stagedOptionalRecursive;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNodeAlpha}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear as values in the map.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedMap extends factory.map("name", factory.number, {
	 * 	metadata: { description: "A map of numbers" }
	 * }) {}
	 * ```
	 */
	public mapAlpha<
		Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): MapNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return mapSchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options,
		);
	}

	/**
	 * {@inheritDoc SchemaFactory.objectRecursive}
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override mapRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.mapAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as MapNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define a {@link TreeNodeSchemaClass} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the array.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedArray extends factory.arrayAlpha("name", factory.number) {}
	 * ```
	 */
	public arrayAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): ArrayNodeCustomizableSchemaAlpha<
		ScopedSchemaName<TScope, Name>,
		T,
		true,
		TCustomMetadata
	> {
		return arraySchema(
			scoped<TScope, TName, Name>(this, name),
			allowedTypes,
			true,
			true,
			options ?? {},
		) as unknown as ArrayNodeCustomizableSchemaAlpha<
			ScopedSchemaName<TScope, Name>,
			T,
			true,
			TCustomMetadata
		>;
	}

	/**
	 * {@link SchemaFactory.arrayRecursive} but with support for some alpha features.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override arrayRecursive<
		const Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		return this.arrayAlpha(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			options,
		) as unknown as ArrayNodeCustomizableSchemaUnsafe<
			ScopedSchemaName<TScope, Name>,
			T,
			TCustomMetadata
		>;
	}

	/**
	 * Define (and add to this library) a {@link TreeNodeSchemaClass} for a {@link (TreeRecordNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 * @param allowedTypes - The types that may appear in the record.
	 * @param options - Additional options for the schema.
	 *
	 * @example
	 * ```typescript
	 * class NamedRecord extends factory.recordAlpha("name", factory.number) {}
	 * ```
	 */
	public recordAlpha<
		const Name extends TName,
		const T extends ImplicitAllowedTypes,
		const TCustomMetadata = unknown,
	>(
		name: Name,
		allowedTypes: T,
		options?: NodeSchemaOptionsAlpha<TCustomMetadata>,
	): RecordNodeCustomizableSchema<ScopedSchemaName<TScope, Name>, T, true, TCustomMetadata> {
		return recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes,
			customizable: true,
			implicitlyConstructable: true,
			nodeOptions: options,
		});
	}

	/**
	 * {@link SchemaFactoryBeta.(record:2)} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of `SchemaFactory.record` uses the same workarounds as {@link SchemaFactory.objectRecursive}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public override recordRecursive<
		Name extends TName,
		const T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
		const TCustomMetadata = unknown,
	>(name: Name, allowedTypes: T, options?: NodeSchemaOptionsAlpha<TCustomMetadata>) {
		const RecordSchema = recordSchema({
			identifier: scoped<TScope, TName, Name>(this, name),
			info: allowedTypes as T & ImplicitAllowedTypes,
			customizable: true,
			// Setting this to true seems to work ok currently, but not for other node kinds.
			// Supporting this could be fragile and might break other future changes, so it's being kept as false for now.
			implicitlyConstructable: false,
			nodeOptions: options,
		});

		return RecordSchema as TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<TScope, Name>,
			/* Kind */ NodeKind.Record,
			/* TNode */ TreeRecordNodeUnsafe<T> &
				WithType<ScopedSchemaName<TScope, Name>, NodeKind.Record>,
			/* TInsertable */ {
				// Ideally this would be
				// RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>,
				// but doing so breaks recursive types.
				// Instead we do a less nice version:
				readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			},
			/* ImplicitlyConstructable */ false,
			/* Info */ T,
			/* TConstructorExtra */ undefined,
			/* TCustomMetadata */ TCustomMetadata
		>;
	}

	/**
	 * Creates a {@link SchemaFactoryAlpha} in a child scope.
	 *
	 * @param name - The name to append to this factory's scope.
	 *
	 * @typeParam T - The name appended to this factory's scope.
	 * @typeParam TNameInner - The names allowed in the child factory.
	 *
	 * @returns A factory with the child scope and this factory's settings.
	 *
	 * @remarks
	 * A child scope keeps related schemas separate from schemas in the parent scope.
	 * The returned factory inherits this factory's {@link SchemaFactoryAlpha.settings}.
	 */
	public scopedFactoryAlpha<
		const T extends TName,
		TNameInner extends number | string = string,
	>(name: T): SchemaFactoryAlpha<ScopedSchemaName<TScope, T>, TNameInner> {
		return this.createDerivedFactory<T, TNameInner>(undefined, name);
	}

	/**
	 * Creates an alpha factory with the same scope and optional replacement settings.
	 *
	 * @param settings - The replacement settings, or `undefined` to inherit this factory's settings.
	 *
	 * @returns A new alpha factory with the same scope.
	 *
	 * @remarks
	 * This does not change the original factory.
	 * Use {@link composeSchemaFactoryAlphaOptions} with this factory's
	 * {@link SchemaFactoryAlpha.settings} to extend the existing settings.
	 *
	 * @example
	 * ```typescript
	 * const extended = sf.createDerivedFactory(
	 *     composeSchemaFactoryAlphaOptions(sf.settings, {
	 *         objectOptions: (_name, _fields, options) => ({
	 *             allowUnknownOptionalFields: true,
	 *             ...options,
	 *         }),
	 *     }),
	 * );
	 * ```
	 */
	public override createDerivedFactory(
		settings?: SchemaFactoryAlphaOptions,
	): SchemaFactoryAlpha<TScope, TName>;

	/**
	 * Creates an alpha factory with a child scope and optional replacement settings.
	 *
	 * @param settings - The replacement settings, or `undefined` to inherit this factory's settings.
	 * @param name - The name to append to this factory's scope.
	 *
	 * @typeParam T - The name appended to this factory's scope.
	 * @typeParam TNameInner - The names allowed in the child factory.
	 *
	 * @returns A new alpha factory with the child scope and the provided or inherited settings.
	 *
	 * @remarks
	 * This does not change the original factory.
	 */
	public override createDerivedFactory<
		const T extends TName,
		TNameInner extends number | string = string,
	>(
		settings: SchemaFactoryAlphaOptions | undefined,
		name: T,
	): SchemaFactoryAlpha<ScopedSchemaName<TScope, T>, TNameInner>;
	public override createDerivedFactory(
		settings: SchemaFactoryAlphaOptions = this.settings,
		name?: TName,
	): SchemaFactoryAlpha<string | undefined, number | string> {
		return new SchemaFactoryAlpha({
			scope: name === undefined ? this.scope : scoped<TScope, TName, TName>(this, name),
			objectOptions: settings.objectOptions,
		});
	}
}
