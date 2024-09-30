/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ErasedType } from "@fluidframework/core-interfaces";

import { NodeKind, type TreeNodeSchemaClass } from "./treeNodeSchema.js";
// eslint-disable-next-line import/no-deprecated
import { type WithType, typeNameSymbol, type typeSchemaSymbol } from "./withType.js";
import { tryGetTreeNodeSchema } from "./treeNodeKernel.js";
import { isFlexTreeNode, type FlexTreeNode } from "../../feature-libraries/index.js";

/**
 * Type alias to document which values are un-hydrated.
 *
 * Un-hydrated values are nodes produced from schema's create functions that haven't been inserted into a tree yet.
 *
 * Since un-hydrated nodes become hydrated when inserted, strong typing can't be used to distinguish them.
 * This no-op wrapper is used instead.
 * @remarks
 * Nodes which are Unhydrated report {@link TreeStatus}.new from `Tree.status(node)`.
 * @privateRemarks
 * TODO: Linking tree status is failing in intellisense and linking directly to its .new item is failing in API extractor as well.
 * WOuld be nice to have a working link here.
 * @public
 */
export type Unhydrated<T> = T;

/**
 * A collection of events that can be emitted by a {@link TreeNode}.
 *
 * @privateRemarks
 * TODO: add a way to subscribe to a specific field (for nodeChanged and treeChanged).
 * Probably have object node and map node specific APIs for this.
 *
 * TODO: ensure that subscription API for fields aligns with API for subscribing to the root.
 *
 * TODO: add more wider area (avoid needing tons of nodeChanged registration) events for use-cases other than treeChanged.
 * Some ideas:
 *
 * - treeChanged, but with some subtrees/fields/paths excluded
 * - helper to batch several nodeChanged calls to a treeChanged scope
 * - parent change (ex: registration on the parent field for a specific index: maybe allow it for a range. Ex: node event takes optional field and optional index range?)
 * - new content inserted into subtree. Either provide event for this and/or enough info to treeChanged to find and search the new sub-trees.
 * Add separate (non event related) API to efficiently scan tree for given set of types (using low level cursor and schema based filtering)
 * to allow efficiently searching for new content (and initial content) of a given type.
 *
 * @sealed @public
 */
export interface TreeChangeEvents {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if any of the changes affected the node.
	 *
	 * - Object nodes define a change as being when the value of one of its properties changes (i.e., the property's value is set, including when set to `undefined`).
	 *
	 * - Array nodes define a change as when an element is added, removed, moved or replaced.
	 *
	 * - Map nodes define a change as when an entry is added, updated, or removed.
	 *
	 * @param unstable - Future versions of this API (such as the one in beta on TreeBeta) may use this argument to provide additional data to the event.
	 * users of this event should ensure that they do not provide a listener callback which has an optional parameter in this position, since unexpected data might get provided to it.
	 * This parameter exists to capture this fact in the type system.
	 * Using an inline lambda expression as the listener callback is a good pattern to avoid cases like this were arguments are added from breaking due to optional arguments.
	 *
	 * @remarks
	 * This event is not emitted when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will emit this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is emitted on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When the event is emitted, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 *
	 * TODO: define and document event ordering (ex: bottom up, with nodeChanged before treeChange on each level).
	 */
	nodeChanged(unstable?: unknown): void;

	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, when something changed anywhere in the
	 * subtree rooted at it.
	 *
	 * @remarks
	 * This event is not emitted when the node itself is moved to a different location in the tree or removed from the tree.
	 * In that case it is emitted on the _parent_ node, not the node itself.
	 *
	 * The node itself is part of the subtree, so this event will be emitted even if the only changes are to the properties
	 * of the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When it is emitted, the tree is guaranteed to be in-schema.
	 */
	treeChanged(): void;
}

/**
 * A non-{@link NodeKind.Leaf|leaf} SharedTree node. Includes objects, arrays, and maps.
 *
 * @remarks
 * Base type which all nodes implement.
 *
 * This can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when used with `instanceof` or extending it), is not currently supported.
 *
 * Instances of tree nodes must be created by opening an existing document, inserting values into the document,
 * or by using the constructors and create functions of {@link TreeNodeSchema} produced by {@link SchemaFactory}.
 * @privateRemarks
 * This is a class not an interface to enable stricter type checking (see {@link TreeNode.#brand})
 * and some runtime enforcement of schema class policy (see the the validation in the constructor).
 * This class is however only `type` exported not value exported, preventing the class object from being used,
 * similar to how interfaces work.
 *
 * Not all node implementations include this in their prototype chain (some hide it with a proxy),
 * and thus cause the default/built in `instanceof` to return false despite our type checking and all other APIs treating them as TreeNodes.
 * This class provides a custom `Symbol.hasInstance` to fix `instanceof` for this class and all classes extending it.
 * For now the type-only export prevents use of `instanceof` on this class (but allows it in subclasses like schema classes).
 * @sealed @public
 */
export abstract class TreeNode implements WithType {
	/**
	 * This is added to prevent TypeScript from implicitly allowing non-TreeNode types to be used as TreeNodes.
	 * @remarks
	 * This field forces TypeScript to use nominal instead of structural typing,
	 * preventing compiler error messages and tools like "add missing properties"
	 * from adding the [type] field as a solution when using a non-TreeNode object where a TreeNode is required.
	 * Instead TreeNodes must be created through the appropriate APIs, see the documentation on {@link TreeNode} for details.
	 *
	 * @privateRemarks
	 * This is a JavaScript private field, so is not accessible from outside this class.
	 * This prevents it from having name collisions with object fields.
	 * Since this is private, the type of this field is stripped in the d.ts file.
	 * To get matching type checking within and from outside the package, the least informative type (`unknown`) is used.
	 * To avoid this having any runtime impact, the field is uninitialized.
	 *
	 * Making this field optional results in different type checking within this project than outside of it, since the d.ts file drops the optional aspect of the field.
	 * This is extra confusing since since the tests get in-project typing for intellisense and separate project checking at build time.
	 * To avoid all this mess, this field is required, not optional.
	 *
	 * Another option would be to use a symbol (possibly as a private field).
	 * That approach ran into some strange difficulties causing SchemaFactory to fail to compile, and was not investigated further.
	 *
	 * The [type] symbol provides a lot of the value this private brand does, but is not all of it:
	 * someone could manually (or via Intellisense auto-implement completion, or in response to a type error)
	 * make an object literal with the [type] field and pass it off as a node: this private brand prevents that.
	 */
	readonly #brand!: unknown;

	/**
	 * Adds a type symbol for stronger typing.
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 * @deprecated Use {@link typeSchemaSymbol} instead.
	 */
	// eslint-disable-next-line import/no-deprecated
	public abstract get [typeNameSymbol](): string;

	/**
	 * Adds a type symbol for stronger typing.
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 */
	public abstract get [typeSchemaSymbol](): TreeNodeSchemaClass;

	/**
	 * Provides `instanceof` support for testing if a value is a `TreeNode`.
	 * @remarks
	 * For more options, like including leaf values or narrowing to collections of schema, use `is` or `schema` from {@link TreeNodeApi}.
	 * @privateRemarks
	 * Due to type-only export, this functionality is not available outside the package.
	 */
	public static [Symbol.hasInstance](value: unknown): value is TreeNode;

	/**
	 * Provides `instanceof` support for all schema classes with public constructors.
	 * @remarks
	 * For more options, like including leaf values or narrowing to collections of schema, use `is` or `schema` from {@link TreeNodeApi}.
	 * @privateRemarks
	 * Despite type-only export, this functionality is available outside the package since it is inherited by subclasses.
	 */
	public static [Symbol.hasInstance]<
		TSchema extends abstract new (
			...args: any[]
		) => TreeNode,
	>(this: TSchema, value: unknown): value is InstanceType<TSchema>;

	public static [Symbol.hasInstance](this: { prototype: object }, value: unknown): boolean {
		const schema = tryGetTreeNodeSchema(value);

		if (schema === undefined || schema.kind === NodeKind.Leaf) {
			return false;
		}

		assert("prototype" in schema, 0x98a /* expected class based schema */);
		return inPrototypeChain(schema.prototype, this.prototype);
	}

	/**
	 * TreeNodes must extend schema classes created by SchemaFactory, and therefore this constructor should not be invoked directly by code outside this package.
	 * @privateRemarks
	 * `token` must be the {@link privateToken} value, which is not package exported.
	 * This is used to detect invalid subclasses.
	 *
	 * All valid subclass should use {@link TreeNodeValid}, but this code doesn't directly reference it to avoid cyclic dependencies.
	 */
	protected constructor(token: unknown) {
		if (token !== privateToken) {
			throw new UsageError("TreeNodes must extend schema classes created by SchemaFactory");
		}
	}
}

/**
 * `token` to pass to {@link TreeNode}'s constructor used to detect invalid subclasses.
 */
export const privateToken = {};

/**
 * Check if the prototype derived's prototype chain contains `base`.
 * @param derived - prototype to check
 * @param base - prototype to search for
 * @returns true iff `base` is in the prototype chain starting at `derived`.
 */
// eslint-disable-next-line @rushstack/no-new-null
export function inPrototypeChain(derived: object | null, base: object): boolean {
	let checking = derived;
	while (checking !== null) {
		if (base === checking) {
			return true;
		}
		checking = Reflect.getPrototypeOf(checking);
	}
	return false;
}

/**
 * A node type internal to `@fluidframework/tree`.
 * @remarks
 * This type is used in the construction of {@link TreeNode} as an implementation detail, but leaks into the public API due to how schema are implemented.
 * @privateRemarks
 * A {@link FlexTreeNode}. Includes {@link RawTreeNode}s.
 * @sealed @public
 */
export interface InternalTreeNode
	extends ErasedType<"@fluidframework/tree.InternalTreeNode"> {}

export function toFlexTreeNode(node: InternalTreeNode): FlexTreeNode {
	assert(isFlexTreeNode(node), 0x963 /* Invalid InternalTreeNode */);
	return node;
}
