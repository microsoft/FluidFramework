/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Lazy } from "@fluidframework/core-utils";

import { FlexListToUnion, LazyItem, isLazy } from "../feature-libraries/index.js";
import { MakeNominal, RestrictiveReadonlyRecord, isReadonlyArray } from "../util/index.js";

import { TreeNode, Unhydrated } from "./types.js";
import { UsageError } from "@fluidframework/telemetry-utils";

/**
 * Helper used to produce types for object nodes.
 * @public
 */
export type ObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * A {@link TreeNode} which modules a JavaScript object.
 * @remarks
 * Object nodes consist of a type which specifies which {@link TreeNodeSchema} they use (see {@link TreeNodeApi.schema}), and a collections of fields, each with a distinct `key` and its own {@link FieldSchema} defining what can be placed under that key.
 *
 * All non-empty fields on an object node are exposed as enumerable own properties with string keys.
 * No other own `own` or `enumerable` properties are included on object nodes unless the user of the node manually adds custom session only state.
 * This allows a majority of general purpose JavaScript object processing operations (like `for...in`, `Reflect.ownKeys()` and `Object.entries()`) to enumerate all the children.
 * @public
 */
export type TreeObjectNode<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecord<T> & WithType<TypeName>;

/**
 * Helper used to produce types for:
 *
 * 1. Insertable content which can be used to construct an object node.
 *
 * 2. Insertable content which is an unhydrated object node.
 *
 * 3. Union of 1 and 2.
 *
 * @privateRemarks TODO: consider separating these cases into different types.
 *
 * @public
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitField<T[Property]>;
};

/**
 * Schema for a tree node.
 * @typeParam Name - The full (including scope) name/identifier for the schema.
 * @typeParam Kind - Which kind of node this schema is for.
 * @typeParam TNode - API for nodes that use this schema.
 * @typeParam TBuild - Data which can be used to construct an {@link Unhydrated} node of this type.
 * @typeParam Info - Data used when defining this schema.
 * @remarks
 * Captures the schema both as runtime data and compile time type information.
 * @public
 */
export type TreeNodeSchema<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode = unknown,
	TBuild = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
> =
	| TreeNodeSchemaClass<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>
	| TreeNodeSchemaNonClass<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>;

/**
 * Schema which is not a class.
 * @remarks
 * This is used for schema which cannot have their instances constructed using constructors, like leaf schema.
 * @privateRemarks
 * Non-class based schema can have issues with recursive types due to https://github.com/microsoft/TypeScript/issues/55832.
 * @public
 */
export interface TreeNodeSchemaNonClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out TNode = unknown,
	in TInsertable = never,
	out ImplicitlyConstructable extends boolean = boolean,
	out Info = unknown,
> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable, Info> {
	create(data: TInsertable): TNode;
}

/**
 * Tree node schema which is implemented using a class.
 * @remarks
 * Instances of this class are nodes in the tree.
 * This is also a constructor so that it can be subclassed.
 *
 * Using classes in this way allows introducing a named type and a named value at the same time, helping keep the runtime and compile time information together and easy to refer to un a uniform way.
 * Additionally, this works around https://github.com/microsoft/TypeScript/issues/55832 which causes similar patterns with less explicit types to infer "any" in the d.ts file.
 * @public
 */
export interface TreeNodeSchemaClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out TNode = unknown,
	in TInsertable = never,
	out ImplicitlyConstructable extends boolean = boolean,
	out Info = unknown,
> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable, Info> {
	/**
	 * Constructs an {@link Unhydrated} node with this schema.
	 * @remarks
	 * This constructor is also used internally to construct hydrated nodes with a different parameter type.
	 * Therefor overriding this constructor is not type-safe and is not supported.
	 * @sealed
	 */
	new (data: TInsertable): Unhydrated<TNode>;
}

/**
 * Data common to all tree node schema.
 * @public
 */
export interface TreeNodeSchemaCore<
	out Name extends string,
	out Kind extends NodeKind,
	out ImplicitlyConstructable extends boolean,
	out Info = unknown,
> {
	readonly identifier: Name;
	readonly kind: Kind;

	/**
	 * Data used to define this schema.
	 *
	 * @remarks
	 * The format depends on the kind of node it is for.
	 * For example, the "object" node kind could store the field schema here.
	 */
	readonly info: Info;

	/**
	 * When constructing insertable content,
	 * data that could be passed to the node's constructor can be used instead of an {@link Unhydrated} node
	 * iff implicitlyConstructable is true.
	 * @privateRemarks
	 * Currently the logic for traversing insertable content,
	 * both to build trees and to hydrate them does not defer to the schema classes to handle the policy,
	 * so if their constructors differ from what is supported, some cases will not work.
	 * Setting this to false adjusts the insertable types to disallow cases which could be impacted by these inconsistencies.
	 */
	readonly implicitlyConstructable: ImplicitlyConstructable;
}

/**
 * Types for use in fields.
 * @public
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * Kind of a field on a node.
 * @public
 */
export enum FieldKind {
	/**
	 * A field which can be empty or filled.
	 * @remarks
	 * Allows 0 or one child.
	 */
	Optional,
	/**
	 * A field which must always be filled.
	 * @remarks
	 * Only allows exactly one child.
	 */
	Required,
}

/**
 * Kind of tree node.
 * @public
 */
export enum NodeKind {
	/**
	 * A node which serves as a map, storing children under string keys.
	 */
	Map,
	/**
	 * A node which serves as an array, storing children in an ordered sequence.
	 */
	Array,
	/**
	 * A node which stores a heterogenous collection of children in named fields.
	 * @remarks
	 * Each field gets its own schema.
	 */
	Object,
	/**
	 * A node which stores a single leaf value.
	 */
	Leaf,
}

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @public
 */
export class FieldSchema<
	out Kind extends FieldKind = FieldKind,
	out Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
> {
	/**
	 * This class is used with instanceof, and therefore should have nominal typing.
	 * This field enforces that.
	 */
	protected _typeCheck?: MakeNominal;

	private readonly lazyTypes: Lazy<ReadonlySet<TreeNodeSchema>>;

	/**
	 * What types of tree nodes are allowed in this field.
	 * @remarks Counterpart to {@link FieldSchema.allowedTypes}, with any lazy definitions evaluated.
	 */
	public get allowedTypeSet(): ReadonlySet<TreeNodeSchema> {
		return this.lazyTypes.value;
	}

	public constructor(
		/**
		 * The {@link https://en.wikipedia.org/wiki/Kind_(type_theory) | kind } of this field.
		 * Determines the multiplicity, viewing and editing APIs as well as the merge resolution policy.
		 */
		public readonly kind: Kind,
		/**
		 * What types of tree nodes are allowed in this field.
		 */
		public readonly allowedTypes: Types,
	) {
		this.lazyTypes = new Lazy(() => normalizeAllowedTypes(this.allowedTypes));
	}
}

/**
 * Normalizes a {@link ImplicitFieldSchema} to a {@link FieldSchema}.
 */
export function normalizeFieldSchema(schema: ImplicitFieldSchema): FieldSchema {
	return schema instanceof FieldSchema ? schema : new FieldSchema(FieldKind.Required, schema);
}
/**
 * Normalizes a {@link ImplicitAllowedTypes} to a set of {@link TreeNodeSchema}s, by eagerly evaluating any
 * lazy schema declarations.
 *
 * @remarks Note: this must only be called after all required schemas have been declared, otherwise evaluation of
 * recursive schemas may fail.
 */
export function normalizeAllowedTypes(types: ImplicitAllowedTypes): ReadonlySet<TreeNodeSchema> {
	const normalized = new Set<TreeNodeSchema>();
	if (isReadonlyArray(types)) {
		for (const lazyType of types) {
			normalized.add(evaluateLazySchema(lazyType));
		}
	} else {
		normalized.add(evaluateLazySchema(types));
	}
	return normalized;
}

function evaluateLazySchema(value: LazyItem<TreeNodeSchema>): TreeNodeSchema {
	const evaluatedSchema = isLazy(value) ? value() : value;
	if (evaluatedSchema === undefined) {
		throw new UsageError(
			`Encountered an undefined schema. This could indicate that some referenced schema has not yet been instantiated.`,
		);
	}
	return evaluatedSchema;
}

/**
 * Types allowed in a field.
 * @remarks
 * Implicitly treats a single type as an array of one type.
 * @public
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;
/**
 * Schema for a field of a tree node.
 * @remarks
 * Implicitly treats {@link ImplicitAllowedTypes} as a Required field of that type.
 * @public
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

/**
 * Converts ImplicitFieldSchema to the corresponding tree node's field type.
 * @public
 */
export type TreeFieldFromImplicitField<TSchema extends ImplicitFieldSchema = FieldSchema> =
	TSchema extends FieldSchema<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypes<TSchema>
		: unknown;

/**
 * Type of content that can be inserted into the tree for a field of the given schema.
 * @public
 */
export type InsertableTreeFieldFromImplicitField<
	TSchema extends ImplicitFieldSchema = FieldSchema,
> = TSchema extends FieldSchema<infer Kind, infer Types>
	? ApplyKind<InsertableTreeNodeFromImplicitAllowedTypes<Types>, Kind>
	: TSchema extends ImplicitAllowedTypes
	? InsertableTreeNodeFromImplicitAllowedTypes<TSchema>
	: unknown;

/**
 * Suitable for output.
 * For input must error on side of excluding undefined instead.
 * @public
 */
export type ApplyKind<T, Kind extends FieldKind> = Kind extends FieldKind.Required
	? T
	: undefined | T;

/**
 * Type of of tree node for a field of the given schema.
 * @public
 */
export type TreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? NodeFromSchema<TSchema>
	: TSchema extends AllowedTypes
	? NodeFromSchema<FlexListToUnion<TSchema>>
	: unknown;

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? InsertableTypedNode<TSchema>
	: TSchema extends AllowedTypes
	? InsertableTypedNode<FlexListToUnion<TSchema>>
	: never;

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @public
 */
export type NodeFromSchema<T extends TreeNodeSchema> = T extends TreeNodeSchema<
	string,
	NodeKind,
	infer TNode
>
	? TNode
	: never;

/**
 * Data which can be used as a node to be inserted.
 * Either an unhydrated node, or content to build a new node.
 * @public
 */
export type InsertableTypedNode<T extends TreeNodeSchema> =
	| (T extends { implicitlyConstructable: true } ? NodeBuilderData<T> : never)
	| Unhydrated<NodeFromSchema<T>>;

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * Currently this assumes factory functions take exactly one argument.
 * This could be changed if needed.
 *
 * These factory functions can also take a FlexTreeNode, but this is not exposed in the public facing types.
 * @public
 */
export type NodeBuilderData<T extends TreeNodeSchema> = T extends TreeNodeSchema<
	string,
	NodeKind,
	unknown,
	infer TBuild
>
	? TBuild
	: never;

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @public
 */
export interface TreeMapNode<T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>,
		TreeNode {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNode.delete} with that key.
	 */
	set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T> | undefined): void;

	/**
	 * Removes the specified element from this map by its `key`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @privateRemarks
	 * Regarding the choice to not return a boolean: Since this data structure is distributed in nature, it isn't
	 * possible to tell whether or not the item was deleted as a result of this method call. Returning a "best guess"
	 * is more likely to create issues / promote bad usage patterns than offer useful information.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;
}

/**
 * Value that may be stored as a leaf node.
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type TreeLeafValue = number | string | boolean | IFluidHandle | null;

/**
 * The type of a {@link TreeNode}.
 * For moore information about the type, use `Tree.schema(theNode)` instead.
 * @remarks
 * This symbol mainly exists on nodes to allow TypeScript to provide more accurate type checking.
 * `Tree.is` and `Tree.schema` provide a superset of this information in more friendly ways.
 *
 * This symbol should not manually be added to objects as doing so allows the object to be invalidly used where nodes are expected.
 * Instead construct a real node of the desired type using its constructor.
 * @privateRemarks
 * This prevents non-nodes from being accidentally used as nodes, as well as allows the type checker to distinguish different node types.
 * @public
 */
export const type: unique symbol = Symbol("TreeNode Type");

/**
 * Adds a {@link "type"} field.
 * @public
 */
export interface WithType<TName extends string = string> {
	/**
	 * {@inheritdoc "type"}
	 */
	get [type](): TName;
}
