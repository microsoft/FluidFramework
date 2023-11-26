/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MakeNominal, RestrictiveReadonlyRecord } from "../util";
import { FlexListToUnion, LazyItem } from "../feature-libraries";
import { TreeListNodeBase, Unhydrated } from "../simple-tree";

/**
 * Base type which all nodes extend.
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class NodeBase {}

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
 * @alpha
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
 * @alpha
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitField<T[Property]>;
};

/**
 * Schema for a tree node.
 * @remarks
 * Captures the schema both as runtime data and compile time type information.
 * @alpha
 */
export type TreeNodeSchema<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	Specification = unknown,
	TNode = unknown,
	TBuild = never,
> =
	| TreeNodeSchemaClass<Name, Kind, Specification, TNode, TBuild>
	| TreeNodeSchemaNonClass<Name, Kind, Specification, TNode, TBuild>;

/**
 * Schema which is not a class.
 * @remarks
 * This is used fort schema which cannot have their instances constructed using constructors, like leaf schema.
 * @privateRemarks
 * Non-class based schema can have issues with recursive types due to https://github.com/microsoft/TypeScript/issues/55832.
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
 * Tree node schema which is implemented using a class.
 * @remarks
 * Instances of this class are nodes in the tree.
 * This is also a constructor so that it can be subclassed.
 *
 * Using classes in this way allows introducing a named type and a named value at the same time, helping keep the runtime and compile time information together and easy to refer to un a uniform way.
 * Additionally, this works around https://github.com/microsoft/TypeScript/issues/55832 which causes similar patterns with less explicit types to infer "any" in the d.ts file.
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
 * Data common to all tree node schema.
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
 * Kind of a field on a node.
 * @alpha
 */
export enum FieldKind {
	Optional,
	Required,
}

/**
 * Kind of tree node.
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

/**
 * Types allowed in a field.
 * @remarks
 * Implicitly treats a single type as an array of one type.
 * @alpha
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;
/**
 * Schema for a field of a tree node.
 * @remarks
 * Implicitly treats {@link ImplicitAllowedTypes} as a Required field of that type.
 * @alpha
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

/**
 * Converts ImplicitFieldSchema to the corresponding tree node's field type.
 * @alpha
 */
export type TreeFieldFromImplicitField<TSchema extends ImplicitFieldSchema = FieldSchema> =
	TSchema extends FieldSchema<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypes<TSchema>
		: unknown;

/**
 * Type of content that can be inserted into the tree for a field of the given schema.
 * @alpha
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
 * @alpha
 */
export type ApplyKind<T, Kind extends FieldKind> = Kind extends FieldKind.Required
	? T
	: undefined | T;

/**
 * Type of of tree node for a field of the given schema.
 * @alpha
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
 * @alpha
 */
export type InsertableTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? InsertableTypedNode<TSchema>
	: TSchema extends AllowedTypes
	? InsertableTypedNode<FlexListToUnion<TSchema>>
	: unknown;

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
 * Data which can be used as a node to be inserted.
 * Either an unhydrated node, or content to build a new node.
 * @alpha
 */
export type InsertableTypedNode<T extends TreeNodeSchema> =
	| NodeBuilderData<T>
	| Unhydrated<NodeFromSchema<T>>;

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * Currently this assumes factory functions take exactly one argument.
 * This could be changed if needed.
 *
 * These factory function can also take an FlexTreeNode, but this is not exposed in the public facing types.
 * @alpha
 */
export type NodeBuilderData<T extends TreeNodeSchema> = T extends TreeNodeSchema<
	any,
	any,
	any,
	any,
	infer TBuild
>
	? TBuild
	: never;
