/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { RestrictiveReadonlyRecord, getOrCreate, isReadonlyArray } from "../util";
import {
	FlexTreeNode,
	LeafNodeSchema as FlexLeafNodeSchema,
	isFlexTreeNode,
	ObjectNodeSchema,
	isLazy,
	markEager,
	MapNodeSchema,
	FieldNodeSchema,
} from "../feature-libraries";
import { leaf } from "../domains";
import { TreeNodeSchemaIdentifier, TreeValue } from "../core";
import {
	createNodeProxy,
	createRawNodeProxy,
	getClassSchema,
	getSequenceField,
	listPrototypeProperties,
	mapStaticDispatchMap,
	// eslint-disable-next-line import/no-internal-modules
} from "../simple-tree/proxies";
import { TreeArrayNode } from "../simple-tree";
import { getFlexSchema, setFlexSchemaFromClassSchema } from "./toFlexSchema";
import {
	AllowedTypes,
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTypedNode,
	NodeBase,
	NodeFromSchema,
	NodeKind,
	ObjectFromSchemaRecord,
	TreeMapNode,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
} from "./schemaTypes";

/**
 * Instances of this class are schema for leaf nodes.
 * @remarks
 * Unlike other schema, leaf schema are class instances instead of classes themselves.
 * This is because the instance type (the tree node type) for leaves are not objects,
 * so those instances can't be instances of a schema based class.
 * @privateRemarks
 * This class refers to the underlying flex tree schema in its constructor, so this class can't be included in the package API.
 */
class LeafNodeSchema<T extends FlexLeafNodeSchema>
	implements TreeNodeSchemaNonClass<UnbrandedName<T>, NodeKind.Leaf, TreeValue<T["info"]>>
{
	public readonly identifier: UnbrandedName<T>;
	public readonly kind = NodeKind.Leaf;
	public readonly info: T["info"];
	public readonly implicitlyConstructable = true as const;
	public create(data: TreeValue<T["info"]>): TreeValue<T["info"]> {
		return data;
	}

	public constructor(schema: T) {
		setFlexSchemaFromClassSchema(this, schema);
		this.identifier = schema.name as UnbrandedName<T>;
		this.info = schema.info;
	}
}

/**
 * Wrapper around LeafNodeSchema's constructor that provides the return type that is desired in the package public API.
 */
function makeLeaf<T extends FlexLeafNodeSchema>(
	schema: T,
): TreeNodeSchema<UnbrandedName<T>, NodeKind.Leaf, TreeValue<T["info"]>, TreeValue<T["info"]>> {
	return new LeafNodeSchema(schema);
}

// Leaf schema shared between all SchemaFactory instances.
const stringSchema = makeLeaf(leaf.string);
const numberSchema = makeLeaf(leaf.number);
const booleanSchema = makeLeaf(leaf.boolean);
const nullSchema = makeLeaf(leaf.null);
const handleSchema = makeLeaf(leaf.handle);

type UnbrandedName<T extends FlexLeafNodeSchema> = T["name"] extends TreeNodeSchemaIdentifier<
	infer Name extends string
>
	? Name
	: T["name"];

/**
 * Builds schema libraries, and the schema within them.
 *
 * @typeParam TScope - Scope added as a prefix to the name of every schema produced by this factory.
 * @typeParam TName - Type of names used to identify each schema produced in this factory.
 * Typically this is just `string` but it is also possible to use `string` or `number` based enums if you prefer to identify your types that way.
 *
 * @sealed @beta
 */
export class SchemaFactory<TScope extends string = string, TName extends number | string = string> {
	private readonly structuralTypes: Map<string, TreeNodeSchema> = new Map();

	/**
	 * @param scope - Prefix appended to the identifiers of all {@link TreeNodeSchema} produced by this builder.
	 * Use of [Reverse domain name notation](https://en.wikipedia.org/wiki/Reverse_domain_name_notation) or a UUIDv4 is recommended to avoid collisions.
	 */
	public constructor(public readonly scope: TScope) {}

	private scoped<Name extends TName | string>(name: Name): `${TScope}.${Name}` {
		return `${this.scope}.${name}`;
	}

	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `string`.
	 *
	 * @remarks
	 * Strings containing unpaired UTF-16 surrogate pair code units may not be handled correctly.
	 *
	 * These limitations come from the use of UTF-8 encoding of the strings, which requires them to be valid unicode.
	 * JavaScript does not make this requirement for its strings so not all possible JavaScript strings are supported.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	public readonly string = stringSchema;

	/**
	 * {@link TreeNodeSchema} for holding a JavaScript `number`.
	 *
	 * @remarks
	 * The number is a [double-precision 64-bit binary format IEEE 754](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) value, however there are some exceptions:
	 * - `NaN`, and the infinities are converted to `null` (and may therefore only be used where `null` is allowed by the schema).
	 * - `-0` may be converted to `0` in some cases.
	 *
	 * These limitations match the limitations of JSON.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	public readonly number = numberSchema;

	/**
	 * {@link TreeNodeSchema} for holding a boolean.
	 */
	public readonly boolean = booleanSchema;

	/**
	 * {@link TreeNodeSchema} for JavaScript `null`.
	 *
	 * @remarks
	 * There are good [reasons to avoid using null](https://www.npmjs.com/package/%40rushstack/eslint-plugin#rushstackno-new-null) in JavaScript, however sometimes it is desired.
	 * This {@link TreeNodeSchema} node provides the option to include nulls in trees when desired.
	 * Unless directly inter-operating with existing data using null, consider other approaches, like wrapping the value in an optional field, or using a more specifically named empty object node.
	 */
	public readonly null = nullSchema;

	/**
	 * {@link TreeNodeSchema} for holding an {@link @fluidframework/core-interfaces#IFluidHandle}.
	 */
	public readonly handle = handleSchema;

	/**
	 * Construct a class that provides the common parts all TreeNodeSchemaClass share.
	 * More specific schema extend this class.
	 */
	private nodeSchema<
		const Name extends TName | string,
		const TKind extends NodeKind,
		T,
		const TImplicitlyConstructable extends boolean,
	>(
		name: Name,
		kind: TKind,
		t: T,
		implicitlyConstructable: TImplicitlyConstructable,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		TKind,
		NodeBase,
		FlexTreeNode | unknown,
		TImplicitlyConstructable
	> {
		const identifier = this.scoped(name);
		class schema extends NodeBase {
			public static readonly identifier = identifier;
			public static readonly kind = kind;
			public static readonly info = t;
			public static readonly implicitlyConstructable: TImplicitlyConstructable =
				implicitlyConstructable;
			/**
			 * This constructor only does validation of the input, and should be passed the argument from the derived type unchanged.
			 * It is up to the derived type to actually do something with this value.
			 */
			public constructor(input: FlexTreeNode | unknown) {
				super();
				// Currently this just does validation. All other logic is in the subclass.
				if (isFlexTreeNode(input)) {
					assert(
						getClassSchema(input.schema) === this.constructor,
						0x83b /* building node with wrong schema */,
					);
				}
				// TODO: make this a better user facing error, and explain how to copy explicitly.
				assert(
					!(input instanceof NodeBase),
					0x83c /* Existing nodes cannot be used as new content to insert. They must either be moved or explicitly copied */,
				);
			}
		}
		// Class objects are functions (callable), so we need a strong way to distinguish between `schema` and `() => schema` when used as a `LazyItem`.
		markEager(schema);
		return schema;
	}

	/**
	 * Define a {@link TreeNodeSchema} for an object node.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 */
	public object<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Object,
		ObjectFromSchemaRecord<T>,
		InsertableObjectFromSchemaRecord<T>,
		true
	> {
		const allowAdditionalProperties = true;
		class schema extends this.nodeSchema(name, NodeKind.Object, t, true) {
			public constructor(input: InsertableObjectFromSchemaRecord<T>) {
				super(input);
				if (isFlexTreeNode(input)) {
					return createNodeProxy(input, allowAdditionalProperties, this) as schema;
				} else {
					const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
					return createRawNodeProxy(
						flexSchema as ObjectNodeSchema,
						input,
						allowAdditionalProperties,
						this,
					) as schema;
				}
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Object,
			ObjectFromSchemaRecord<T>,
			InsertableObjectFromSchemaRecord<T>,
			true
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeMapNodeBase}.
	 *
	 * @remarks
	 * The {@link TreeNodeSchemaIdentifier} for this Map is defined as a function of the provided types.
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
	 * See note on list.
	 */
	public map<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchema<
		`${TScope}.Map<${string}>`,
		NodeKind.Map,
		TreeMapNode<T>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>,
		true
	>;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNodeBase}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
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
		`${TScope}.${Name}`,
		NodeKind.Map,
		TreeMapNode<T>,
		ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true
	>;

	public map<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchema<
		`${TScope}.${string}`,
		NodeKind.Map,
		TreeMapNode<T>,
		ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Map", types);
			return getOrCreate(
				this.structuralTypes,
				fullName,
				() =>
					this.namedMap(
						fullName as TName,
						nameOrAllowedTypes as T,
						false,
						true,
					) as TreeNodeSchema,
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.Map,
				TreeMapNode<T>,
				ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
				true
			>;
		}
		return this.namedMap(nameOrAllowedTypes as TName, allowedTypes, true, true);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeMapNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks See remarks on {@link SchemaFactory.namedArray}.
	 */
	public namedMap<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Map,
		TreeMapNode<T>,
		ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable
	> {
		class schema extends this.nodeSchema(
			name,
			NodeKind.Map,
			allowedTypes,
			implicitlyConstructable,
		) {
			public constructor(
				input: ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			) {
				super(input);
				if (isFlexTreeNode(input)) {
					return createNodeProxy(
						input,
						customizable,
						customizable ? this : undefined,
					) as schema;
				} else {
					const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
					return createRawNodeProxy(
						flexSchema as MapNodeSchema,
						input,
						customizable,
						customizable ? this : undefined,
					) as schema;
				}
			}
		}

		// Setup map functionality
		Object.defineProperties(schema.prototype, mapStaticDispatchMap);

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Map,
			TreeMapNode<T>,
			ReadonlyMap<string, InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			ImplicitlyConstructable
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @remarks
	 * The identifier for this List is defined as a function of the provided types.
	 * It is still scoped to this SchemaFactory, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named lists, other types in this schema builder should avoid names of the form `List<${string}>`.
	 *
	 * @example
	 * The returned schema should be used as a schema directly:
	 * ```typescript
	 * const MyList = factory.list(factory.number);
	 * type MyList = NodeFromSchema<typeof MyList>;
	 * ```
	 * Or inline:
	 * ```typescript
	 * factory.object("Foo", {myList: factory.list(factory.number)});
	 * ```
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal since TypeScript's structural types.
	 * For example attempts to narrow unions of structural lists by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 *
	 * The return value is a class, but its the type is intentionally not specific enough to indicate it is a class.
	 * This prevents callers of this from sub-classing it, which is unlikely to work well (due to the ease of accidentally giving two different calls o this different subclasses)
	 * when working with structural typing.
	 */
	public array<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchema<
		`${TScope}.List<${string}>`,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true
	>;

	/**
	 * Define (and add to this library) a {@link FieldNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @example
	 * ```typescript
	 * class NamedList extends factory.list("name", factory.number) {}
	 * ```
	 */
	public array<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true
	>;

	public array<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchema<
		`${TScope}.${string}`,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		true
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("List", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedArray(fullName, nameOrAllowedTypes as T, false, true),
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.Array,
				TreeArrayNode<T>,
				Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
				true
			>;
		}
		return this.namedArray(nameOrAllowedTypes as TName, allowedTypes, true, true);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
	 *
	 * @param name - Unique identifier for this schema within this factory's scope.
	 *
	 * @remarks
	 * This is not intended to be used directly, use the overload of `list` which takes a name instead.
	 * This is only public to work around a compiler limitation.
	 *
	 * @privateRemarks
	 * TODO: this should be made private or protected.
	 * Doing so breaks due to:
	 * `src/class-tree/schemaFactoryRecursive.ts:42:9 - error TS2310: Type 'List' recursively references itself as a base type.`
	 * Once recursive APIs are better sorted out and integrated into this class, switch this back to private.
	 */
	public namedArray<
		Name extends TName | string,
		const T extends ImplicitAllowedTypes,
		const ImplicitlyConstructable extends boolean,
	>(
		name: Name,
		allowedTypes: T,
		customizable: boolean,
		implicitlyConstructable: ImplicitlyConstructable,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Array,
		TreeArrayNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable
	> {
		// This class returns a proxy from its constructor to handle numeric indexing.
		// Alternatively it could extend a normal class which gets tons of numeric properties added.
		class schema extends this.nodeSchema(
			name,
			NodeKind.Array,
			allowedTypes,
			implicitlyConstructable,
		) {
			[x: number]: TreeNodeFromImplicitAllowedTypes<T>;
			public get length(): number {
				return getSequenceField(this as unknown as TreeArrayNode).length;
			}
			public constructor(input: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>) {
				super(input);
				if (isFlexTreeNode(input)) {
					return createNodeProxy(
						input,
						customizable,
						customizable ? this : undefined,
					) as schema;
				} else {
					const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
					return createRawNodeProxy(
						flexSchema as FieldNodeSchema,
						[...input],
						customizable,
						customizable ? this : undefined,
					) as schema;
				}
			}
		}

		// Setup list functionality
		Object.defineProperties(schema.prototype, listPrototypeProperties);

		return schema as unknown as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Array,
			TreeArrayNode<T>,
			Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
			ImplicitlyConstructable
		>;
	}

	/**
	 * Make a field optional instead of the default which is required.
	 */
	public optional<const T extends ImplicitAllowedTypes>(
		t: T,
	): FieldSchema<FieldKind.Optional, T> {
		return new FieldSchema(FieldKind.Optional, t);
	}

	/**
	 * Function which can be used for its compile time side-effects to tweak the evaluation order of recursive types to make them compile.
	 * @remarks
	 * Some related information in https://github.com/microsoft/TypeScript/issues/55758.
	 *
	 * Also be aware that code which relies on this tends to break VSCode's IntelliSense every time anything related to that code (even comments) is edited.
	 * Running the command `TypeScript: Restart TS Server` with the schema file focused should fix it.
	 * Sometimes this does not work: closing all open files except the schema before running the command can help.
	 * Real compile errors (for example elsewhere in the file) can also cause the IntelliSense to not work correctly ever after `TypeScript: Restart TS Server`.
	 *
	 * Intellisense has also shown problems when schema files with recursive types are part of a cyclic file dependency.
	 * Splitting the schema into its own file with minimal dependencies can help with this.
	 *
	 * Ensure `"noImplicitAny": true` is set in the `tsconfig.json`.
	 * Without it, recursive types that are not working properly can infer `any` and give very non-type-safe results instead of erroring.
	 *
	 * @example
	 * ```typescript
	 * const factory = new SchemaFactory("example");
	 * const recursiveReference = () => RecursiveObject;
	 * factory.fixRecursiveReference(recursiveReference);
	 * export class RecursiveObject extends factory.object("exampleObject", {
	 * 	recursive: [recursiveReference],
	 * }) {}
	 * ```
	 */
	public fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}
}

// TODO: unify this with logic in getOrCreateNodeProxy
export function createTree<T extends TreeNodeSchema>(
	schema: T,
	data: InsertableTypedNode<T> | FlexTreeNode,
): NodeFromSchema<T> {
	if (typeof schema === "function") {
		return new (schema as TreeNodeSchemaClass<
			any,
			any,
			any,
			InsertableTypedNode<T> | FlexTreeNode
		>)(data) as NodeFromSchema<T>;
	}
	return (
		schema as TreeNodeSchemaNonClass<any, any, any, InsertableTypedNode<T> | FlexTreeNode>
	).create(data) as NodeFromSchema<T>;
}

export function structuralName<const T extends string>(
	collectionName: T,
	allowedTypes: TreeNodeSchema | readonly TreeNodeSchema[],
): `${T}<${string}>` {
	let inner: string;
	if (!isReadonlyArray(allowedTypes)) {
		return structuralName(collectionName, [allowedTypes]);
	} else {
		const names = allowedTypes.map((t): string => {
			// Ensure that lazy types (functions) don't slip through here.
			assert(!isLazy(t), 0x83d /* invalid type provided */);
			return t.identifier;
		});
		// Ensure name is order independent
		names.sort();
		// Ensure name can't have collisions by quoting and escaping any quotes in the names of types.
		// Using JSON is a simple way to accomplish this.
		// The outer `[]` around the result are also needed so that a single type name "Any" would not collide with the "any" case above.
		inner = JSON.stringify(names);
	}
	return `${collectionName}<${inner}>`;
}
