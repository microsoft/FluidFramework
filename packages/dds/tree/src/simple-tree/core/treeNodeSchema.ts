/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalTreeNode, Unhydrated } from "./types.js";

/**
 * Schema for a tree node.
 * @typeParam Name - The full (including scope) name/identifier for the schema.
 * @typeParam Kind - Which kind of node this schema is for.
 * @typeParam TNode - API for nodes that use this schema.
 * @typeParam TBuild - Data which can be used to construct an {@link Unhydrated} node of this type.
 * @typeParam Info - Data used when defining this schema.
 * @remarks
 * Captures the schema both as runtime data and compile time type information.
 * @sealed @public
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
 * @sealed @public
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
 *
 * When sub-classing a a `TreeNodeSchemaClass`, some extra rules must be followed:
 *
 * - Only ever use a single class from the schema's class hierarchy within a document and its schema.
 * For example, if using {@link SchemaFactory.object} you can do:
 * ```typescript
 * // Recommended "customizable" object schema pattern.
 * class Good extends schemaFactory.object("A", {
 * 	exampleField: schemaFactory.number,
 * }) {
 * 	public exampleCustomMethod(): void {
 * 		this.exampleField++;
 * 	}
 * }
 * ```
 * But should avoid:
 * ```typescript
 * // This by itself is ok, and opts into "POJO mode".
 * const base = schemaFactory.object("A", {});
 * // This is a bad pattern since it leaves two classes in scope which derive from the same SchemaFactory defined class.
 * // If both get used, its an error!
 * class Invalid extends base {}
 * ```
 * - Do not modify the constructor input parameter types or values:
 * ```typescript
 * class Invalid extends schemaFactory.object("A", {
 * 	exampleField: schemaFactory.number,
 * }) {
 * 	// This Modifies the type of the constructor input.
 * 	// This is unsupported due to programmatic access to the constructor being used internally.
 * 	public constructor(a: number) {
 * 		super({ exampleField: a });
 * 	}
 * }
 * ```
 * @sealed @public
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
	 * Therefore, overriding this constructor with different argument types is not type-safe and is not supported.
	 * @sealed
	 */
	new (data: TInsertable | InternalTreeNode): Unhydrated<TNode>;
}
/**
 * Data common to all tree node schema.
 * @remarks
 * Implementation detail of {@link TreeNodeSchema} which should be accessed instead of referring to this type directly.
 * @sealed @public
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
 * Kind of tree node.
 * @remarks
 * More kinds may be added over time, so do not assume this is an exhaustive set.
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
