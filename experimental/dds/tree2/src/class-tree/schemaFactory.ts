/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Assume,
	Brand,
	MakeNominal,
	Opaque,
	RestrictiveReadonlyRecord,
	_InlineTrick,
	fail,
	getOrAddInMap,
	requireAssignableTo,
} from "../util";
// eslint-disable-next-line import/no-internal-modules
import { ArrayHasFixedLength, LazyItem } from "../feature-libraries/typed-schema/flexList";
import {
	FlexTreeObjectNode,
	FlexTreeNode,
	InternalTypedSchemaTypes,
	LeafNodeSchema as FlexLeafNodeSchema,
} from "../feature-libraries";
import { leaf } from "../domains";
import { TreeValue } from "../core";

type UnhydratedData = unknown;

class NodeBase {
	#node: FlexTreeObjectNode | UnhydratedData;
	public constructor(node: FlexTreeObjectNode | UnhydratedData) {
		this.#node = node;
	}
}

/**
 * Type erased references to an internal tree representation.
 * For use in APIs which leak into the package public API which need to reference internal tree types.
 */
export interface TreeHandle extends Opaque<Brand<FlexTreeNode, "tree.TreeHandle">> {}

class ObjectNodeBase extends NodeBase {}

function makeLeaf<T extends FlexLeafNodeSchema>(
	schema: T,
): TreeNodeSchema<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>> {
	return new LeafNodeSchema(schema);
}
/**
 * Instances of this class are schema for leaf nodes.
 */
class LeafNodeSchema<T extends FlexLeafNodeSchema>
	implements
		TreeNodeSchemaNonClass<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>>
{
	public readonly identifier: T["name"];
	public readonly kind = NodeKind.Leaf;
	public readonly info: T["info"];
	public create(data: TreeValue<T["info"]>): TreeValue<T["info"]> {
		return data;
	}

	public constructor(public readonly schema: T) {
		this.identifier = schema.name;
		this.info = schema.info;
	}
}

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaFactory<TScope extends string, TName extends number | string = string> {
	public constructor(public readonly scope: TScope) {}

	private scoped<Name extends TName>(name: Name): `${TScope}.${Name}` {
		return `${this.scope}.${name}`;
	}

	public readonly string = makeLeaf(leaf.string);
	public readonly number = makeLeaf(leaf.number);
	public readonly boolean = makeLeaf(leaf.boolean);
	public readonly null = makeLeaf(leaf.null);
	public readonly handle = makeLeaf(leaf.handle);

	private nodeSchema<Name extends TName, T>(name: Name, t: T) {
		const identifier = this.scoped(name);
		const schema = class extends ObjectNodeBase {
			public static readonly identifier = identifier;
			public static readonly kind = NodeKind.Object;
			public static readonly info = t;
		};
		{
			type _check = requireAssignableTo<
				typeof schema & { create(data: any): unknown },
				TreeNodeSchema<`${TScope}.${Name}`, NodeKind.Object, T>
			>;
		}
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
	>(name: Name, t: T) {
		const schema = class extends this.nodeSchema(name, t) {
			readonly [x: string]: unknown;

			public constructor(dummy: UnhydratedData) {
				// TODO: needs to work for create (above) case, as well as some programmatic construction for hydrated nodes.
				super(dummy);
			}
		};
		// TODO: add fields to instance type.
		{
			type _check = requireAssignableTo<
				typeof schema,
				TreeNodeSchema<`${TScope}.${Name}`, NodeKind.Object, T>
			>;
		}

		const retyped = schema as TreeNodeSchemaCore<`${TScope}.${Name}`, NodeKind.Object, T> &
			(new (dummy: UnhydratedData) => InstanceType<typeof schema> & {
				[Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
			});

		return retyped;
	}

	public map<Name extends TName, const T extends ImplicitAllowedTypes>(name: Name, t: T) {
		const schema = class extends this.nodeSchema(name, t) {
			public constructor(dummy: UnhydratedData) {
				// TODO: needs to work for create (above) case, as well as some programmatic construction for hydrated nodes.
				super(dummy);
			}
			public get(key: string): TreeNodeFromImplicitAllowedTypes<T> | undefined {
				fail("todo");
			}
			public set(key: string, value: TreeNodeFromImplicitAllowedTypes<T> | undefined): void {
				fail("todo");
			}
		};
		{
			type _check = requireAssignableTo<
				typeof schema,
				TreeNodeSchema<`${TScope}.${Name}`, NodeKind.Object, T>
			>;
		}
		return schema;
	}

	public list<Name extends TName, const T extends ImplicitAllowedTypes>(name: Name, t: T) {
		// TODO: this class can extend one which returns a proxy from its constructor to handle numeric indexing.
		// Alternatively it could extend a normal class which gets tons of numeric properties added.
		const schema = class extends this.nodeSchema(name, t) {
			readonly [x: number]: TreeNodeFromImplicitAllowedTypes<T>;
			public constructor(dummy: UnhydratedData) {
				// TODO: needs to work for create (above) case, as well as some programmatic construction for hydrated nodes.
				super(dummy);
			}
			public moveToEnd(key: number): void {
				fail("todo");
			}

			public at(index: number): TreeNodeFromImplicitAllowedTypes<T> | undefined {
				fail("todo");
			}

			public [Symbol.iterator](): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>> {
				return fail("todo");
			}

			public get length(): number {
				return fail("todo");
			}
		};
		{
			type _check = requireAssignableTo<
				typeof schema,
				TreeNodeSchema<`${TScope}.${Name}`, NodeKind.Object, T>
			>;
		}
		return schema;
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

export interface TreeNodeSchemaNonClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	create(data: UnhydratedData | TreeHandle): TNode;
}

export interface TreeNodeSchemaClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
> extends TreeNodeSchemaCore<Name, Kind, Specification> {
	// TODO: better types for this input
	new (data: UnhydratedData | TreeHandle): TNode;
}

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

export enum FieldKind {
	Optional,
	Required,
}

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

/**
 * A symbol for storing TreeObjectNode schema on FlexTreeObjectNode.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

export const simpleNode = new WeakMap<FlexTreeObjectNode, unknown>();

export function getSimpleNode(node: FlexTreeObjectNode): unknown {
	return getOrAddInMap(simpleNode, node, () => {
		const schema = node.schema;
		if (simpleSchemaSymbol in schema) {
			const simpleSchema = schema[simpleSchemaSymbol] as new (
				dummy: FlexTreeObjectNode,
			) => unknown;
			return new simpleSchema(node);
		}
		// Item without simple schema;
		// TODO: implement fallback for this case??
		fail("missing schema");
	});
}

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
