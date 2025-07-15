/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { SimpleNodeSchemaBase } from "../simpleSchema.js";

import type { TreeNode } from "./treeNode.js";
import type { InternalTreeNode, Unhydrated } from "./types.js";
import type { UnionToIntersection } from "../../util/index.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	ImplicitAnnotatedAllowedTypes,
	NormalizedAnnotatedAllowedTypes,
} from "./allowedTypes.js";
import type { Context } from "./context.js";

/**
 * Schema for a {@link TreeNode} or {@link TreeLeafValue}.
 *
 * @typeParam Name - The full (including scope) name/identifier for the schema.
 * @typeParam Kind - Which kind of node this schema is for.
 * @typeParam TNode - API for nodes that use this schema.
 * @typeParam TBuild - Data which can be used to construct an {@link Unhydrated} node of this type.
 * @typeParam Info - Data used when defining this schema.
 * @remarks
 * Captures the schema both as runtime data and compile time type information.
 * Use {@link SchemaFactory} to define schema.
 * Use `Tree.schema(value)` to lookup the schema for a {@link TreeNode} or {@link TreeLeafValue}.
 * @privateRemarks
 * TODO:
 * The long lists of type parameters here are awkward to deal with.
 * Switching to (or adding an option to use)
 * an interface based pattern with unordered named parameters for types like this would be a good idea.
 * The related `@system` types should be simple to port to the new pattern, but stable public one like this will need to support both:
 * the new one could either be added as a system type, or be recommended to replace this one (deprecating it).
 * @sealed @public
 */
export type TreeNodeSchema<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode extends TreeNode | TreeLeafValue = TreeNode | TreeLeafValue,
	TBuild = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
	TCustomMetadata = unknown,
> =
	| (TNode extends TreeNode
			? TreeNodeSchemaClass<
					Name,
					Kind,
					TNode,
					TBuild,
					ImplicitlyConstructable,
					Info,
					never,
					TCustomMetadata
				>
			: never)
	| TreeNodeSchemaNonClass<
			Name,
			Kind,
			TNode,
			TBuild,
			ImplicitlyConstructable,
			Info,
			never,
			TCustomMetadata
	  >;

/**
 * Schema which is not a class.
 * @remarks
 * This is used for schema which cannot have their instances constructed using constructors, like leaf schema.
 * @privateRemarks
 * Non-class based schema can have issues with recursive types due to https://github.com/microsoft/TypeScript/issues/55832.
 * @system @sealed @public
 */
export type TreeNodeSchemaNonClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode extends TreeNode | TreeLeafValue = TreeNode | TreeLeafValue,
	TInsertable = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
	TConstructorExtra = never,
	TCustomMetadata = unknown,
> = TreeNodeSchemaCore<
	Name,
	Kind,
	ImplicitlyConstructable,
	Info,
	TInsertable,
	TCustomMetadata
> &
	(undefined extends TConstructorExtra
		? {
				/**
				 * Constructs an {@link Unhydrated} node with this schema.
				 * @privateRemarks
				 * Also allows InternalTreeNode.
				 * @sealed
				 */
				create(data?: TInsertable | TConstructorExtra): TNode;
			}
		: {
				/**
				 * Constructs an {@link Unhydrated} node with this schema.
				 * @privateRemarks
				 * Also allows InternalTreeNode.
				 * @sealed
				 */
				create(data: TInsertable | TConstructorExtra): TNode;
			});

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
 *
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
export type TreeNodeSchemaClass<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode extends TreeNode = TreeNode,
	TInsertable = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
	TConstructorExtra = never,
	TCustomMetadata = unknown,
> = TreeNodeSchemaCore<
	Name,
	Kind,
	ImplicitlyConstructable,
	Info,
	TInsertable,
	TCustomMetadata
> &
	(undefined extends TConstructorExtra
		? {
				/**
				 * Constructs an {@link Unhydrated} node with this schema.
				 * @remarks
				 * This constructor is also used internally to construct hydrated nodes with a different parameter type.
				 * Therefore, overriding this constructor with different argument types is not type-safe and is not supported.
				 * @sealed
				 */
				// The approach suggested by the linter here is more concise, but ir break intellisense for the constructor.
				// eslint-disable-next-line @typescript-eslint/prefer-function-type
				new (data?: TInsertable | InternalTreeNode | TConstructorExtra): Unhydrated<TNode>;
			}
		: {
				/**
				 * Constructs an {@link Unhydrated} node with this schema.
				 * @remarks
				 * This constructor is also used internally to construct hydrated nodes with a different parameter type.
				 * Therefore, overriding this constructor with different argument types is not type-safe and is not supported.
				 * @sealed
				 */
				// The approach suggested by the linter here is more concise, but ir break intellisense for the constructor.
				// eslint-disable-next-line @typescript-eslint/prefer-function-type
				new (data: TInsertable | InternalTreeNode | TConstructorExtra): Unhydrated<TNode>;
			});

/**
 * Internal helper for utilities that return schema which can be used in class and non class formats depending on the API exposing it.
 */
export type TreeNodeSchemaBoth<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TNode extends TreeNode = TreeNode,
	TInsertable = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
	TConstructorExtra = never,
	TCustomMetadata = unknown,
> = TreeNodeSchemaClass<
	Name,
	Kind,
	TNode,
	TInsertable,
	ImplicitlyConstructable,
	Info,
	TConstructorExtra,
	TCustomMetadata
> &
	TreeNodeSchemaNonClass<
		Name,
		Kind,
		TNode,
		TInsertable,
		ImplicitlyConstructable,
		Info,
		TConstructorExtra,
		TCustomMetadata
	>;

/**
 * Data common to all tree node schema.
 *
 * @remarks
 * Implementation detail of {@link TreeNodeSchema} which should be accessed instead of referring to this type directly.
 *
 * @privateRemarks
 * All implementations must implement {@link TreeNodeSchemaCorePrivate} as well.
 *
 * @sealed @public
 */
export interface TreeNodeSchemaCore<
	out Name extends string,
	out Kind extends NodeKind,
	out ImplicitlyConstructable extends boolean,
	out Info = unknown,
	out TInsertable = never,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBase<Kind, TCustomMetadata> {
	/**
	 * Unique (within a document's schema) identifier used to associate nodes with their schema.
	 * @remarks
	 * This is used when encoding nodes, and when decoding nodes to re-associate them with the schema.
	 * Since this decoding may happen in a different version of the application (or even a different application altogether),
	 * this identifier should generally correspond to some specific semantics for the data (how to interpret the node with this identifier).
	 * Any time the semantics change such that data would be misinterpreted if the old semantics were applied
	 * (for example the units of a value are changed),
	 * it is best practice to pick a new identifier.
	 */
	readonly identifier: Name;

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

	/**
	 * All possible schema that a direct child of a node with this schema could have.
	 *
	 * Equivalently, this is also all schema directly referenced when defining this schema's allowed child types,
	 * which is also the same as the set of schema referenced directly by the `Info` type parameter and the `info` property.
	 * This property is simply re-exposing that information in an easier to traverse format consistent across all node kinds.
	 * @remarks
	 * Some kinds of nodes may have additional restrictions on children:
	 * this set simply enumerates all directly referenced schema, and can be use to walk over all referenced schema types.
	 *
	 * This set cannot be used before the schema in it have been defined:
	 * more specifically, when using lazy schema references (for example to make foreword references to schema which have not yet been defined),
	 * users must wait until after the schema are defined to access this set.
	 * @privateRemarks
	 * Currently there isn't much use for this in the public API,
	 * and it's possible this will want to be tweaked or renamed as part of a larger schema reflection API surface that might be added later.
	 * To keep options option, this is marked `@system` for now.
	 * @system
	 */
	readonly childTypes: ReadonlySet<TreeNodeSchema>;

	/**
	 * Constructs an instance of this node type.
	 * @remarks
	 * Due to TypeScript limitations, the return type of this method can not be very specific.
	 * For {@link TreeNodeSchemaClass} prefer using the constructor directly for better typing.
	 * For {@link TreeNodeSchemaNonClass} use `create`.
	 *
	 * @privateRemarks
	 * This method signature provides a way to infer `TInsertable` without relying on the constructor, and to construct nodes from schema of unknown kind.
	 * This makes customizations of the constructor not impact the typing of insertable content, allowing customization of the constructor,
	 * as long as doing so only adds additional supported cases.
	 *
	 * This cannot be required to return `TNode`:
	 * doing so breaks sub-classing of schema since they don't overload this method with a more specific return type.
	 * @sealed @system
	 */
	createFromInsertable(data: TInsertable): Unhydrated<TreeNode | TreeLeafValue>;
}

/**
 * Symbol for use by {@link TreeNodeSchemaCorePrivate}.
 */
export const privateDataSymbol = Symbol("PrivateData");

/**
 * {@link TreeNodeSchemaCore} extended with some non-exported APIs.
 */
export interface TreeNodeSchemaCorePrivate<
	Name extends string = string,
	Kind extends NodeKind = NodeKind,
	TInsertable = never,
	ImplicitlyConstructable extends boolean = boolean,
	Info = unknown,
	TCustomMetadata = unknown,
> extends TreeNodeSchemaCore<
		Name,
		Kind,
		ImplicitlyConstructable,
		Info,
		TInsertable,
		TCustomMetadata
	> {
	/**
	 * Package private data provided by all {@link TreeNodeSchema}.
	 * @remarks
	 * Users can add custom statics to schema classes.
	 * To reduce the risk of such statics colliding with properties used to implement the schema,
	 * some of the private APIs are grouped together under this symbol.
	 *
	 * Note that there are still some properties which are not under a symbol and thus expose some risk of name collisions.
	 * See {@link TreeNodeValid} for some such properties.
	 */
	readonly [privateDataSymbol]: TreeNodeSchemaPrivateData;
}

/**
 * Package private data provided by all {@link TreeNodeSchema}.
 * @remarks
 * This data needs to be available before lazy schema references are resolved.
 * For data which is only available after lazy schema references are resolved,
 * see {@link TreeNodeSchemaInitializedData}, which can be accessed via {@link TreeNodeSchemaPrivateData.idempotentInitialize}.
 */
export interface TreeNodeSchemaPrivateData {
	/**
	 * All possible annotated allowed types that a field under a node with this schema could have.
	 * @remarks
	 * In this case "field" includes anything that is a field in the internal (flex-tree) abstraction layer.
	 * This includes the content field for arrays, and all the fields for map nodes.
	 * If this node does not have fields (and thus is a leaf), the array will be empty.
	 *
	 * This set cannot be used before the schema in it have been defined:
	 * more specifically, when using lazy schema references (for example to make foreword references to schema which have not yet been defined),
	 * users must wait until after the schema are defined to access this array.
	 *
	 * @privateRemarks
	 * If this is stabilized, it will live alongside the childTypes property on {@link TreeNodeSchemaCore}.
	 * @system
	 */
	readonly childAnnotatedAllowedTypes: readonly ImplicitAnnotatedAllowedTypes[];

	/**
	 * Idempotent initialization function that pre-caches data and can dereference lazy schema references.
	 */
	idempotentInitialize(): TreeNodeSchemaInitializedData;
}

/**
 * Additional data about a given schema which is private to this package.
 * @remarks
 * Created by {@link TreeNodeValid.oneTimeSetup} and can involve dereferencing lazy schema references.
 */
export interface TreeNodeSchemaInitializedData {
	/**
	 * All possible annotated allowed types that a field under a node with this schema could have.
	 * @remarks
	 * In this case "field" includes anything that is a field in the internal (flex-tree) abstraction layer.
	 * This includes the content field for arrays, and all the fields for map nodes.
	 * If this node does not have fields (and thus is a leaf), the array will be empty.
	 *
	 * This set cannot be used before the schema in it have been defined:
	 * more specifically, when using lazy schema references (for example to make foreword references to schema which have not yet been defined),
	 * users must wait until after the schema are defined to access this array.
	 *
	 * @privateRemarks
	 * If this is stabilized, it will live alongside the childTypes property on {@link TreeNodeSchemaCore}.
	 * @system
	 */
	readonly childAnnotatedAllowedTypes: readonly NormalizedAnnotatedAllowedTypes[];

	/**
	 * A {@link Context} which can be used for unhydrated nodes of this schema.
	 */
	readonly context: Context;
}

/**
 * Downcasts a {@link TreeNodeSchemaCore} to {@link TreeNodeSchemaCorePrivate} and get its {@link TreeNodeSchemaPrivateData}.
 */
export function getTreeNodeSchemaPrivateData(
	schema: TreeNodeSchemaCore<string, NodeKind, boolean>,
): TreeNodeSchemaPrivateData {
	assert(
		privateDataSymbol in schema,
		0xbc9 /* All implementations of TreeNodeSchemaCore must also implement TreeNodeSchemaCorePrivate */,
	);
	const schemaValid = schema as TreeNodeSchemaCorePrivate;
	return schemaValid[privateDataSymbol];
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
	Map = 0,
	/**
	 * A node which serves as an array, storing children in an ordered sequence.
	 */
	Array = 1,
	/**
	 * A node which stores a heterogenous collection of children in named fields.
	 * @remarks
	 * Each field gets its own schema.
	 */
	Object = 2,
	/**
	 * A node which stores a single leaf value.
	 */
	Leaf = 3,
	/**
	 * A node which serves as a record, storing children under string keys.
	 */
	Record = 4,
}

/**
 * Metadata associated with a Node Schema.
 *
 * @remarks Specified via {@link NodeSchemaOptions.metadata}.
 *
 * @sealed
 * @public
 */
export interface NodeSchemaMetadata<out TCustomMetadata = unknown> {
	/**
	 * User-defined metadata.
	 */
	readonly custom?: TCustomMetadata | undefined;

	/**
	 * The description of the Node Schema.
	 *
	 * @remarks
	 *
	 * If provided, will be used by the system in scenarios where a description of the kind of node is useful.
	 * E.g., when converting a Node Schema to {@link https://json-schema.org/ | JSON Schema}, this description will be
	 * used as the `description` property.
	 */
	readonly description?: string | undefined;
}

/**
 * Returns true if the given schema is a {@link TreeNodeSchemaClass}, or otherwise false if it is a {@link TreeNodeSchemaNonClass}.
 * @internal
 */
export function isTreeNodeSchemaClass<
	Name extends string,
	Kind extends NodeKind,
	TNode extends TreeNode | TreeLeafValue,
	TBuild,
	ImplicitlyConstructable extends boolean,
	Info,
>(
	schema:
		| TreeNodeSchema<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>
		| TreeNodeSchemaClass<Name, Kind, TNode & TreeNode, TBuild, ImplicitlyConstructable, Info>,
): schema is TreeNodeSchemaClass<
	Name,
	Kind,
	TNode & TreeNode,
	TBuild,
	ImplicitlyConstructable,
	Info
> {
	return schema.constructor !== undefined;
}

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @privateRemarks
 * If a schema is both TreeNodeSchemaClass and TreeNodeSchemaNonClass, prefer TreeNodeSchemaClass since that includes subclasses properly.
 * @public
 */
export type NodeFromSchema<T extends TreeNodeSchema> = T extends TreeNodeSchemaClass<
	string,
	NodeKind,
	infer TNode
>
	? TNode
	: T extends TreeNodeSchemaNonClass<string, NodeKind, infer TNode>
		? TNode
		: never;

/**
 * Data which can be used as a node to be inserted.
 * Either an unhydrated node, or content to build a new node.
 *
 * @see {@link Input}
 *
 * @typeparam TSchemaInput - Schema to process.
 * @typeparam T - Do not specify: default value used as implementation detail.
 * @privateRemarks
 * This can't really be fully correct, since TreeNodeSchema's TNode is generally use covariantly but this code uses it contravariantly.
 * That makes this TreeNodeSchema actually invariant with respect to TNode, but doing that would break all `extends TreeNodeSchema` clauses.
 * As is, this works correctly in most realistic use-cases.
 *
 * One special case this makes is if the result of NodeFromSchema contains TreeNode, this must be an under constrained schema, so the result is set to never.
 * Note that applying UnionToIntersection on the result of NodeFromSchema<T> does not work since it breaks booleans.
 *
 * @public
 */
export type InsertableTypedNode<
	TSchema extends TreeNodeSchema,
	T = UnionToIntersection<TSchema>,
> =
	| (T extends TreeNodeSchema<string, NodeKind, TreeNode | TreeLeafValue, never, true>
			? NodeBuilderData<T>
			: never)
	| (T extends TreeNodeSchema
			? Unhydrated<TreeNode extends NodeFromSchema<T> ? never : NodeFromSchema<T>>
			: never);

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * This uses TreeNodeSchemaCore, and thus depends on TreeNodeSchemaCore.createFromInsertable for the typing.
 * This works almost the same as using TreeNodeSchema,
 * except that the more complex typing in TreeNodeSchema case breaks for non-class schema and leaks in `undefined` from optional crete parameters.
 * @system @public
 */
export type NodeBuilderData<T extends TreeNodeSchemaCore<string, NodeKind, boolean>> =
	T extends TreeNodeSchemaCore<string, NodeKind, boolean, unknown, infer TBuild>
		? TBuild
		: never;

/**
 * Value that may be stored as a leaf node.
 * @remarks
 * Some limitations apply, see the documentation for {@link SchemaStatics.number} and {@link SchemaStatics.string} for those restrictions.
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type TreeLeafValue = number | string | boolean | IFluidHandle | null;
