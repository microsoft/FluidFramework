/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Assume,
	Brand,
	MakeNominal,
	Opaque,
	RestrictiveReadonlyRecord,
	_InlineTrick,
	getOrCreate,
	isReadonlyArray,
	requireAssignableTo,
} from "../util";
import {
	ArrayHasFixedLength,
	LazyItem,
	isLazy,
	markEager,
	// eslint-disable-next-line import/no-internal-modules
} from "../feature-libraries/typed-schema/flexList";
import {
	FlexTreeObjectNode,
	FlexTreeNode,
	InternalTypedSchemaTypes,
	LeafNodeSchema as FlexLeafNodeSchema,
} from "../feature-libraries";
import { leaf } from "../domains";
import { TreeValue } from "../core";
import { TreeListNodeBase, Unhydrated, TreeMapNodeBase } from "../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { createNodeProxy } from "../simple-tree/proxies";

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Only set when TreeNodeSchema are wrapping existing FlexTreeSchema (done for as with leaves).
 */
export const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

/**
 * @alpha
 * TODO: replace this with proper schema based type.
 */
export type UnhydratedData = unknown;

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
		Name extends TName,
		T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): TreeNodeSchemaClass<`${TScope}.${Name}`, NodeKind.Object, T, ObjectFromSchema<T>> {
		class schema extends this.nodeSchema(name, NodeKind.Object, t) {
			public constructor(editNode: FlexTreeNode | UnhydratedData) {
				super();
				// TODO: handle unhydrated data case.
				// TODO: make return value a proxy over this (or not a proxy).
				return createNodeProxy(editNode as FlexTreeNode) as schema;
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Object,
			T,
			ObjectFromSchema<T>
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
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
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
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
	>;

	public map<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<
		`${TScope}.${string}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
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
				TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
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
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
	> {
		class schema extends this.nodeSchema(name, NodeKind.Map, allowedTypes) {
			public constructor(editNode: FlexTreeNode | UnhydratedData) {
				super();
				// TODO: handle unhydrated data case.
				// TODO: make return value a proxy over this (or not a proxy).
				return createNodeProxy(editNode as FlexTreeNode) as schema;
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Map,
			T,
			TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>
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
	): TreeNodeSchemaClass<`${TScope}.List<${string}>`, NodeKind.List, T, TreeListNode<T>>;

	/**
	 * Define (and add to this library) a {@link FieldNodeSchema} for a {@link TreeListNode}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public list<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<`${TScope}.${Name}`, NodeKind.List, T, TreeListNode<T>>;

	public list<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<`${TScope}.${string}`, NodeKind.List, T, TreeListNode<T>> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("List", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedList(fullName, nameOrAllowedTypes as T),
			) as TreeNodeSchemaClass<`${TScope}.${string}`, NodeKind.List, T, TreeListNode<T>>;
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
	): TreeNodeSchemaClass<`${TScope}.${Name}`, NodeKind.List, T, TreeListNode<T>> {
		// This class returns a proxy from its constructor to handle numeric indexing.
		// Alternatively it could extend a normal class which gets tons of numeric properties added.
		class schema extends this.nodeSchema(name, NodeKind.List, allowedTypes) {
			[x: number]: TreeNodeFromImplicitAllowedTypes<T>;
			public constructor(node: FlexTreeObjectNode | UnhydratedData) {
				super();
				// TODO: make return value a proxy over this (or not a proxy).
				// TODO: support UnhydratedData
				return createNodeProxy(node as FlexTreeObjectNode) as schema;
			}
		}
		return schema as unknown as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.List,
			T,
			TreeListNode<T>
		>;
	}

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

export type ObjectFromSchema<T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>> = {
	[Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
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
> =
	| TreeNodeSchemaClass<Name, Kind, Specification, TNode>
	| TreeNodeSchemaNonClass<Name, Kind, Specification, TNode>;

/**
 * @alpha
 */
export interface TreeNodeSchemaNonClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	create(data: UnhydratedData | TreeHandle): TNode;
}

/**
 * @alpha
 */
export interface TreeNodeSchemaClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	// TODO: better types for this input
	new (data: UnhydratedData | TreeHandle): TNode;
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

export type TreeNodeFromAllowedTypes<TTypes extends AllowedTypes = AllowedTypes> =
	InternalTypedSchemaTypes.ArrayToUnion<
		TypeArrayToTypedFlexTreeArray<
			Assume<
				InternalTypedSchemaTypes.FlexListToNonLazyArray<TTypes>,
				readonly TreeNodeSchema[]
			>
		>
	>;

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type TypeArrayToTypedFlexTreeArray<T extends readonly TreeNodeSchema[]> = [
	ArrayHasFixedLength<T> extends false
		? T extends readonly (infer InnerT)[]
			? [NodeFromSchema<Assume<InnerT, TreeNodeSchema>>]
			: never
		: FixedSizeTypeArrayToTypedFlexTree<T>,
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type FixedSizeTypeArrayToTypedFlexTree<T extends readonly TreeNodeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				NodeFromSchema<Assume<Head, TreeNodeSchema>>,
				...FixedSizeTypeArrayToTypedFlexTree<Assume<Tail, readonly TreeNodeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type NodeFromSchema<T extends TreeNodeSchema> = T extends new (data: any) => infer Result
	? Result
	: ReturnType<Assume<T, TreeNodeSchemaNonClass>["create"]>;

// TODO: unify this with logic in getOrCreateNodeProxy
export function createTree<T extends TreeNodeSchema>(schema: T, data: unknown): NodeFromSchema<T> {
	if (typeof schema === "function") {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		return new (schema as TreeNodeSchemaClass)(data) as NodeFromSchema<T>;
	}
	return schema.create(data) as NodeFromSchema<T>;
}

/**
 * Ideas:
 *
 * allow class schema to override "serializeSessionState", to allow persisting things like selection? Maybe support via decorator?
 * override methods for events?
 */

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
