/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Brand,
	MakeNominal,
	Opaque,
	RestrictiveReadonlyRecord,
	fail,
	getOrCreate,
	isReadonlyArray,
	requireAssignableTo,
} from "../util";
import {
	LazyItem,
	isLazy,
	markEager,
	// eslint-disable-next-line import/no-internal-modules
} from "../feature-libraries/typed-schema/flexList";
import {
	FlexTreeNode,
	InternalTypedSchemaTypes,
	LeafNodeSchema as FlexLeafNodeSchema,
	isFlexTreeNode,
	ObjectNodeSchema,
} from "../feature-libraries";
import { leaf } from "../domains";
import { TreeValue } from "../core";
import { TreeListNodeBase, Unhydrated, TreeMapNodeBase } from "../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { createNodeProxy, createRawObjectProxy, getClassSchema } from "../simple-tree/proxies";
import {
	cachedFlexSchemaFromClassSchema,
	flexSchemaSymbol,
} from "./cachedFlexSchemaFromClassSchema";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class NodeBase {}

/**
 * Type erased references to an internal tree representation.
 * For use in APIs which leak into the package public API which need to reference internal tree types.
 * @alpha
 */
export interface TreeHandle extends Opaque<Brand<FlexTreeNode, "tree.TreeHandle">> {}

function makeLeaf<T extends FlexLeafNodeSchema>(
	schema: T,
): TreeNodeSchema<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>> {
	return new LeafNodeSchema(schema);
}
/**
 * Instances of this class are schema for leaf nodes.
 */
export class LeafNodeSchema<T extends FlexLeafNodeSchema>
	implements
		TreeNodeSchemaNonClass<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>>
{
	public readonly identifier: T["name"];
	public readonly kind = NodeKind.Leaf;
	public readonly info: T["info"];
	public create(data: TreeValue<T["info"]>): TreeValue<T["info"]> {
		return data;
	}

	public constructor(schema: T) {
		(this as any)[flexSchemaSymbol] = schema;
		this.identifier = schema.name;
		this.info = schema.info;
	}
}

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaFactory<TScope extends string, TName extends number | string = string> {
	private readonly structuralTypes: Map<string, TreeNodeSchema> = new Map();

	public constructor(public readonly scope: TScope) {}

	private scoped<Name extends TName | string>(name: Name): `${TScope}.${Name}` {
		return `${this.scope}.${name}`;
	}

	public readonly string = makeLeaf(leaf.string);
	public readonly number = makeLeaf(leaf.number);
	public readonly boolean = makeLeaf(leaf.boolean);
	public readonly null = makeLeaf(leaf.null);
	public readonly handle = makeLeaf(leaf.handle);

	private nodeSchema<Name extends TName | string, TKind extends NodeKind, T>(
		name: Name,
		kind: TKind,
		t: T,
	) {
		const identifier = this.scoped(name);
		class schema extends NodeBase {
			public static readonly identifier = identifier;
			public static readonly kind = kind;
			public static readonly info = t;
			public constructor(input: FlexTreeNode | unknown) {
				super();
				// Currently this just does validation. All other logic is in the subclass.
				if (isFlexTreeNode(input)) {
					assert(
						getClassSchema(input.schema) === this.constructor,
						"building node with wrong schema",
					);
				}
				// TODO: make this a better user facing error, and explain how to copy explicitly.
				assert(
					!(input instanceof NodeBase),
					"Existing nodes cannot be used as new content to insert. THey must either be moved or explicitly copied",
				);
			}
		}
		{
			type _check = requireAssignableTo<
				typeof schema,
				TreeNodeSchema<`${TScope}.${Name}`, TKind, T>
			>;
		}
		markEager(schema);
		return schema;
	}

	/**
	 * Define a {@link TreeNodeSchema} for an object node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
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
		T,
		ObjectFromSchemaRecord<T>,
		InsertableObjectFromSchemaRecord<T>
	> {
		class schema extends this.nodeSchema(name, NodeKind.Object, t) {
			public constructor(input: InsertableObjectFromSchemaRecord<T>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					const cached =
						cachedFlexSchemaFromClassSchema(this.constructor as TreeNodeSchema) ??
						fail("missing cached schema");
					return createRawObjectProxy(cached as ObjectNodeSchema, input, this) as schema;
				}
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Object,
			T,
			ObjectFromSchemaRecord<T>,
			InsertableObjectFromSchemaRecord<T>
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @remarks
	 * The {@link TreeNodeSchemaIdentifier} for this Map is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named maps, other types in this schema builder should avoid names of the form `Map<${string}>`.
	 *
	 * If the returned class is subclassed, that subclass must be used for all matching lists or an error will occur when configuring the tree.
	 * @privateRemarks
	 * See note on list.
	 */
	public map<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.Map<${string}>`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	>;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 */
	public map<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	>;

	public map<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<
		`${TScope}.${string}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Map", types);
			return getOrCreate(
				this.structuralTypes,
				fullName,
				() => this.namedMap(fullName as TName, nameOrAllowedTypes as T) as TreeNodeSchema,
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.Map,
				T,
				TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
				ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
			>;
		}
		return this.namedMap(nameOrAllowedTypes as TName, allowedTypes);
	}

	private namedMap<Name extends TName | string, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	> {
		class schema extends this.nodeSchema(name, NodeKind.Map, allowedTypes) {
			public constructor(input: ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					// unhydrated data case.
					fail("todo");
				}
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Map,
			T,
			TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
			ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeListNode}.
	 *
	 * @remarks
	 * The identifier for this List is defined as a function of the provided types.
	 * It is still scoped to this SchemaFactory, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named lists, other types in this schema builder should avoid names of the form `List<${string}>`.
	 *
	 * If the returned class is subclassed, that subclass must be used for all matching lists or an error will occur when configuring the tree.
	 *
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal since TypeScript's structural types.
	 * For example attempts to narrow unions of structural lists by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 */
	public list<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.List<${string}>`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	>;

	/**
	 * Define (and add to this library) a {@link FieldNodeSchema} for a {@link TreeListNode}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public list<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	>;

	public list<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<
		`${TScope}.${string}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("List", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedList(fullName, nameOrAllowedTypes as T),
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.List,
				T,
				TreeListNode<T>,
				Iterable<TreeNodeFromImplicitAllowedTypes<T>>
			>;
		}
		return this.namedList(nameOrAllowedTypes as TName, allowedTypes);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeListNode}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	private namedList<Name extends TName | string, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	> {
		// This class returns a proxy from its constructor to handle numeric indexing.
		// Alternatively it could extend a normal class which gets tons of numeric properties added.
		class schema extends this.nodeSchema(name, NodeKind.List, allowedTypes) {
			[x: number]: TreeNodeFromImplicitAllowedTypes<T>;
			public get length(): number {
				return fail("this exists only to make proxy valid");
			}
			public constructor(input: Iterable<TreeNodeFromImplicitAllowedTypes<T>>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					// unhydrated data case.
					fail("todo");
				}
			}
		}
		return schema as unknown as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.List,
			T,
			TreeListNode<T>,
			Iterable<TreeNodeFromImplicitAllowedTypes<T>>
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
	 * Also be aware that code which relies on this (or the "recursive" SchemaBuilder methods tends to break VSCode's IntelliSense every time anything related to that code (even comments) is edited.
	 * The command `TypeScript: Restart TS Server` should fix it.
	 * Sometimes this does not work: the exact cause has not been confirmed but if you have the file open multiple times (for example in both sides of a window split into two columns): closing the extra copy may help.
	 * Focusing the file with the errors before running `TypeScript: Restart TS Server` can also help.
	 * Real compile errors (for example elsewhere in the file) can also cause the IntelliSense to not work correctly ever after `TypeScript: Restart TS Server`.
	 */
	public fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}
}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export interface TreeListNode<TTypes extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeListNodeBase<
		TreeNodeFromImplicitAllowedTypes<TTypes>,
		Unhydrated<TreeNodeFromImplicitAllowedTypes<TTypes>>, // TODO: insertion type.
		TreeListNode
	> {}

/**
 * Helper used to produce types for object nodes.
 */
export type ObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * Helper used to produce types for:
 * 1. Insertable content which can be used to construct an object node.
 * 2. Insertable content which is an unhydrated object node.
 * 3. Union of 1 and 2.
 *
 * TODO: consider separating these cases into different types.
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * Interface which carries the runtime and compile type data (from the generic type parameter) in a member.
 * This is also a constructor so that instances of it can be extended as classes.
 * Using classes in this way allows introducing a named type and a named value at the same time, helping keep the runtime and compile time information together and easy to refer to un a uniform way.
 * Additionally, this works around https://github.com/microsoft/TypeScript/issues/55832 which causes similar patterns with less explicit types to infer "any" in the d.ts file.
 * @alpha
 */
export type TreeNodeSchema<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
	TInsertable = never,
> =
	| TreeNodeSchemaClass<Name, Kind, Specification, TNode, TInsertable>
	| TreeNodeSchemaNonClass<Name, Kind, Specification, TNode, TInsertable>;

/**
 * @alpha
 */
export interface TreeNodeSchemaNonClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out Specification = unknown,
	out TNode = unknown,
	in TInsertable = never,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	create(data: TInsertable): TNode;
}

/**
 * @alpha
 */
export interface TreeNodeSchemaClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out Specification = unknown,
	out TNode = unknown,
	in TInsertable = never,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	new (data: TInsertable): TNode;
}

/**
 * @alpha
 */
export interface TreeNodeSchemaCore<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out Specification = unknown,
> {
	readonly identifier: Name;
	readonly kind: Kind;
	readonly info: Specification;
}

/**
 * Types for use in fields.
 *
 * "Any" is boxed in an array to allow use as variadic parameter.
 * @alpha
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * @alpha
 */
export enum FieldKind {
	Optional,
	Required,
}

/**
 * @alpha
 */
export enum NodeKind {
	Map,
	List,
	Object,
	Leaf,
}

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<
	out Kind extends FieldKind = FieldKind,
	out Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
> {
	protected _typeCheck?: MakeNominal;

	/**
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of tree nodes are allowed in this field.
	 */
	public constructor(
		public readonly kind: Kind,
		public readonly allowedTypes: Types,
	) {}
}

export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

export type TreeFieldFromImplicitField<TSchema extends ImplicitFieldSchema = FieldSchema> =
	TSchema extends FieldSchema<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypes<TSchema>
		: unknown;

/**
 * Suitable for output.
 * For input must error on side of excluding undefined instead.
 */
export type ApplyKind<T, Kind extends FieldKind> = Kind extends FieldKind.Required
	? T
	: undefined | T;

export type TreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? NodeFromSchema<TSchema>
	: TSchema extends AllowedTypes
	? TreeNodeFromAllowedTypes<TSchema>
	: unknown;

export type TreeNodeFromAllowedTypes<TTypes extends AllowedTypes = AllowedTypes> = NodeFromSchema<
	InternalTypedSchemaTypes.FlexListToUnion<TTypes>
>;

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type NodeFromSchema<T extends TreeNodeSchema> = T extends TreeNodeSchema<
	any,
	any,
	any,
	infer TNode
>
	? TNode
	: never;

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * Currently this assumes factory functions take exactly one argument.
 * This could be changed if needed.
 *
 * These factory function can also take an FlexTreeNode, but this is not exposed in the public facing types.
 * @alpha
 */
export type InsertableTypedNode<T extends TreeNodeSchema> = T extends TreeNodeSchema<
	any,
	any,
	any,
	any,
	infer TInsertable
>
	? TInsertable
	: never;

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
			any,
			InsertableTypedNode<T> | FlexTreeNode
		>)(data) as NodeFromSchema<T>;
	}
	return (
		schema as TreeNodeSchemaNonClass<any, any, any, any, InsertableTypedNode<T> | FlexTreeNode>
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
			assert(!isLazy(t), "invalid type provided");
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
