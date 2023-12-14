/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MakeNominal, RestrictiveReadonlyRecord } from "../util";
import { FlexListToUnion, LazyItem } from "../feature-libraries";
import { Unhydrated, TreeMapNodeBase } from "../simple-tree";

/**
 * Base type which all nodes extend.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class NodeBase {}

/**
 * Helper used to produce types for object nodes.
 * @beta
 */
export type ObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * Helper used to produce types for:
 *
 * 1. Insertable content which can be used to construct an object node.
 *
 * 2. Insertable content which is an unhydrated object node.
 *
 * 3. Union of 1 and 2.
 *
 * TODO: consider separating these cases into different types.
 * @beta
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
 * @typeParam TBuild - Data which can be used to construct an unhydrated node of this type.
 * @remarks
 * Captures the schema both as runtime data and compile time type information.
 * @beta
 */
export type TreeNodeSchema<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode = unknown,
	TBuild = never,
	ImplicitlyConstructable extends boolean = boolean,
> =
	| TreeNodeSchemaClass<Name, Kind, TNode, TBuild, ImplicitlyConstructable>
	| TreeNodeSchemaNonClass<Name, Kind, TNode, TBuild, ImplicitlyConstructable>;

/**
 * Schema which is not a class.
 * @remarks
 * This is used for schema which cannot have their instances constructed using constructors, like leaf schema.
 * @privateRemarks
 * Non-class based schema can have issues with recursive types due to https://github.com/microsoft/TypeScript/issues/55832.
 * @beta
 */
export interface TreeNodeSchemaNonClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out TNode = unknown,
	in TInsertable = never,
	out ImplicitlyConstructable extends boolean = boolean,
> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable> {
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
 * @beta
 */
export interface TreeNodeSchemaClass<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
	out TNode = unknown,
	in TInsertable = never,
	out ImplicitlyConstructable extends boolean = boolean,
> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable> {
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
 * @beta
 */
export interface TreeNodeSchemaCore<
	out Name extends string,
	out Kind extends NodeKind,
	out ImplicitlyConstructable extends boolean,
> {
	readonly identifier: Name;
	readonly kind: Kind;
	readonly info: unknown;

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
 * @beta
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * Kind of a field on a node.
 * @beta
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
 * @beta
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
 * @sealed @beta
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

/**
 * Types allowed in a field.
 * @remarks
 * Implicitly treats a single type as an array of one type.
 * @beta
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;
/**
 * Schema for a field of a tree node.
 * @remarks
 * Implicitly treats {@link ImplicitAllowedTypes} as a Required field of that type.
 * @beta
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

/**
 * Converts ImplicitFieldSchema to the corresponding tree node's field type.
 * @beta
 */
export type TreeFieldFromImplicitField<TSchema extends ImplicitFieldSchema = FieldSchema> =
	TSchema extends FieldSchema<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypes<TSchema>
		: unknown;

/**
 * Type of content that can be inserted into the tree for a field of the given schema.
 * @beta
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
 * @beta
 */
export type ApplyKind<T, Kind extends FieldKind> = Kind extends FieldKind.Required
	? T
	: undefined | T;

/**
 * Type of of tree node for a field of the given schema.
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
 */
export type InsertableTypedNode<T extends TreeNodeSchema> =
	| (T["implicitlyConstructable"] extends true ? NodeBuilderData<T> : never)
	| Unhydrated<NodeFromSchema<T>>;

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * Currently this assumes factory functions take exactly one argument.
 * This could be changed if needed.
 *
 * These factory functions can also take a FlexTreeNode, but this is not exposed in the public facing types.
 * @beta
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
 * @beta
 */
export interface TreeMapNode<T extends ImplicitAllowedTypes>
	extends TreeMapNodeBase<
		TreeNodeFromImplicitAllowedTypes<T>,
		InsertableTreeNodeFromImplicitAllowedTypes<T>
	> {}
