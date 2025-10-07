/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITreeCursorSynchronous, TreeFieldStoredSchema } from "../../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	isTreeValue,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	Context,
	getKernel,
	getOrCreateNodeFromInnerNode,
	isTreeNode,
	UnhydratedContext,
	type NodeKind,
	type TreeLeafValue,
	type TreeNode,
	type Unhydrated,
	type WithType,
} from "../core/index.js";
import { getUnhydratedContext } from "../createContext.js";
import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "../fieldSchema.js";
import {
	unhydratedFlexTreeFromInsertable,
	type InsertableContent,
} from "../unhydratedFlexTreeFromInsertable.js";

import { createFromCursor } from "./create.js";
import { conciseFromCursor, type ConciseTree } from "./conciseTree.js";
import type { TreeEncodingOptions } from "./customTree.js";
import { cursorFromVerbose } from "./verboseTree.js";
import type { TreeChangeEvents } from "./treeChangeEvents.js";
import { treeNodeApi } from "./treeNodeApi.js";
import type { InsertableField, UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";

// Tests for this file are grouped with those for treeNodeApi.ts as that is where this functionality will eventually land,
// and where most of the actual implementation is for much of it.

/**
 * Data included for {@link TreeChangeEventsBeta.nodeChanged}.
 * @sealed @beta
 */
export interface NodeChangedData<TNode extends TreeNode = TreeNode> {
	/**
	 * When the node changed is an object or Map node, this lists all the properties which changed.
	 * @remarks
	 * This only includes changes to the node itself (which would trigger {@link TreeChangeEvents.nodeChanged}).
	 *
	 * Set to `undefined` when the {@link NodeKind} does not support this feature (currently just ArrayNodes).
	 *
	 * When defined, the set should never be empty, since `nodeChanged` will only be triggered when there is a change, and for the supported node types, the only things that can change are properties.
	 */
	readonly changedProperties?: ReadonlySet<
		// For Object nodes, make changedProperties required and strongly typed with the property names from the schema:
		TNode extends WithType<string, NodeKind.Object, infer TInfo>
			? string & keyof TInfo
			: string
	>;
}

/**
 * Extensions to {@link TreeChangeEvents} which are not yet stable.
 *
 * @sealed @beta
 */
export interface TreeChangeEventsBeta<TNode extends TreeNode = TreeNode>
	extends TreeChangeEvents {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if any of the changes affected the node.
	 *
	 * - Object nodes define a change as being when the value of one of its properties changes (i.e., the property's value is set, including when set to `undefined`).
	 *
	 * - Array nodes define a change as when an element is added, removed, moved or replaced.
	 *
	 * - Map nodes define a change as when an entry is added, updated, or removed.
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
	 *
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (
		data: NodeChangedData<TNode> &
			// Make the properties of object, map, and record nodes required:
			(TNode extends WithType<string, NodeKind.Map | NodeKind.Object | NodeKind.Record>
				? Required<Pick<NodeChangedData<TNode>, "changedProperties">>
				: unknown),
	) => void;
}

/**
 * Extensions to {@link (Tree:interface)} which are not yet stable.
 * @remarks
 * Use via the {@link (TreeBeta:variable)} singleton.
 * @system @sealed @beta
 */
export interface TreeBeta {
	/**
	 * Register an event listener on the given node.
	 * @param node - The node whose events should be subscribed to.
	 * @param eventName - Which event to subscribe to.
	 * @param listener - The callback to trigger for the event. The tree can be read during the callback, but it is invalid to modify the tree during this callback.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on<K extends keyof TreeChangeEventsBeta<TNode>, TNode extends TreeNode>(
		node: TNode,
		eventName: K,
		listener: NoInfer<TreeChangeEventsBeta<TNode>[K]>,
	): () => void;

	/**
	 * A less type-safe version of {@link (TreeAlpha:interface).create}, suitable for importing data.
	 * @remarks
	 * Due to {@link ConciseTree} relying on type inference from the data, its use is somewhat limited.
	 * This does not support {@link ConciseTree|ConciseTrees} with customized handle encodings or using persisted keys.
	 * Use "compressed" or "verbose" formats for more flexibility.
	 *
	 * When using this function,
	 * it is recommend to ensure your schema is unambiguous with {@link ITreeConfigurationOptions.preventAmbiguity}.
	 * If the schema is ambiguous, consider using {@link (TreeAlpha:interface).create} and {@link Unhydrated} nodes where needed,
	 * or using {@link (TreeAlpha:interface).(importVerbose:1)} and specify all types.
	 *
	 * Documented (and thus recoverable) error handling/reporting for this is not yet implemented,
	 * but for now most invalid inputs will throw a recoverable error.
	 */
	importConcise<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: ConciseTree | undefined,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}.
	 */
	exportConcise(node: TreeNode | TreeLeafValue, options?: TreeEncodingOptions): ConciseTree;

	/**
	 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}, allowing undefined.
	 */
	exportConcise(
		node: TreeNode | TreeLeafValue | undefined,
		options?: TreeEncodingOptions,
	): ConciseTree | undefined;

	/**
	 * Clones the persisted data associated with a node.
	 *
	 * @param node - The node to clone.
	 * @returns A new unhydrated node with the same persisted data as the original node.
	 * @remarks
	 * Some key things to note:
	 *
	 * - Local state, such as properties added to customized schema classes, will not be cloned. However, they will be
	 * initialized to their default state just as if the node had been created via its constructor.
	 *
	 * - Value node types (i.e., numbers, strings, booleans, nulls and Fluid handles) will be returned as is.
	 *
	 * - The identifiers in the node's subtree will be preserved, i.e., they are not replaced with new values.
	 *
	 * - If the node (or any node in its subtree) contains {@link SchemaFactoryObjectOptions.allowUnknownOptionalFields|unknown optional fields},
	 * those fields will be cloned just like the known fields.
	 */
	clone<const TSchema extends ImplicitFieldSchema>(
		node: TreeFieldFromImplicitField<TSchema>,
	): TreeFieldFromImplicitField<TSchema>;

	// TODO: support more clone options
	// /**
	//  * Like {@link (TreeBeta:interface).create}, except deeply clones existing nodes.
	//  * @remarks
	//  * This only clones the persisted data associated with a node.
	//  * Local state, such as properties added to customized schema classes, will not be cloned:
	//  * they will be initialized however they end up after running the constructor, just like if a remote client had inserted the same nodes.
	//  */
	// clone<const TSchema extends ImplicitFieldSchema>(
	// 	original: TreeFieldFromImplicitField<TSchema>,
	// 	options?: {
	// 		/**
	// 		 * If set, all identifier's in the cloned tree (See {@link SchemaFactory.identifier}) will be replaced with new ones allocated using the default identifier allocation schema.
	// 		 * Otherwise any identifiers will be preserved as is.
	// 		 */
	// 		replaceIdentifiers?: true;
	// 	},
	// ): TreeFieldFromImplicitField<TSchema>;

	/**
	 * Construct tree content that is compatible with the field defined by the provided `schema`.
	 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
	 * @param data - The data used to construct the field content.
	 * @remarks
	 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
	 * This function exists as a generalization that can be used in other cases as well,
	 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
	 */
	create<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: InsertableTreeFieldFromImplicitField<TSchema>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>>;
}

/**
 * Borrow a cursor from a node.
 * @remarks
 * The cursor must be put back to its original location before the node is used again.
 */
export function borrowCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	if (isTreeValue(node)) {
		return cursorFromVerbose(node, {});
	}
	const kernel = getKernel(node);
	const cursor = kernel.getOrCreateInnerNode().borrowCursor();
	return cursor;
}

/**
 * {@inheritDoc (TreeBeta:interface).importConcise}
 */
export function importConcise<TSchema extends ImplicitFieldSchema>(
	schema: TSchema & ImplicitFieldSchema,
	data: ConciseTree | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>>;
/**
 * {@inheritDoc (TreeAlpha:interface).importConcise}
 */
export function importConcise<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	schema: UnsafeUnknownSchema extends TSchema
		? ImplicitFieldSchema
		: TSchema & ImplicitFieldSchema,
	data: ConciseTree | undefined,
): Unhydrated<
	TSchema extends ImplicitFieldSchema
		? TreeFieldFromImplicitField<TSchema>
		: TreeNode | TreeLeafValue | undefined
>;
export function importConcise<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	schema: UnsafeUnknownSchema extends TSchema
		? ImplicitFieldSchema
		: TSchema & ImplicitFieldSchema,
	data: ConciseTree | undefined,
): Unhydrated<
	TSchema extends ImplicitFieldSchema
		? TreeFieldFromImplicitField<TSchema>
		: TreeNode | TreeLeafValue | undefined
> {
	// Create the tree content from insertable data
	const mapTree = unhydratedFlexTreeFromInsertable(
		data as InsertableField<UnsafeUnknownSchema>,
		schema,
	);
	const result = mapTree === undefined ? undefined : getOrCreateNodeFromInnerNode(mapTree);
	return result as Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	>;
}

/**
 * {@inheritDoc (TreeBeta:interface).(exportConcise:1)}
 */
export function exportConcise(
	node: TreeNode | TreeLeafValue,
	options?: TreeEncodingOptions,
): ConciseTree;
/**
 * {@inheritDoc (TreeBeta:interface).(exportConcise:2)}
 */
export function exportConcise(
	node: TreeNode | TreeLeafValue | undefined,
	options?: TreeEncodingOptions,
): ConciseTree | undefined;
export function exportConcise(
	node: TreeNode | TreeLeafValue | undefined,
	options?: TreeEncodingOptions,
): ConciseTree | undefined {
	if (!isTreeNode(node)) {
		return node;
	}
	const config: TreeEncodingOptions = { ...options };

	const kernel = getKernel(node);
	const cursor = borrowCursorFromTreeNodeOrValue(node);
	return conciseFromCursor(cursor, kernel.context, config);
}

/**
 * Extensions to {@link (Tree:variable)} which are not yet stable.
 * @see {@link (TreeBeta:interface)}.
 * @beta
 */
export const TreeBeta: TreeBeta = {
	on<K extends keyof TreeChangeEventsBeta<TNode>, TNode extends TreeNode>(
		node: TNode,
		eventName: K,
		listener: NoInfer<TreeChangeEventsBeta<TNode>[K]>,
	): () => void {
		return treeNodeApi.on(node, eventName, listener);
	},

	importConcise,
	exportConcise,

	clone<const TSchema extends ImplicitFieldSchema>(
		node: TreeFieldFromImplicitField<TSchema>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		// The only non-TreeNode cases are {@link TreeLeafValue} and `undefined` (for an empty optional field) which can be returned as is.
		if (!isTreeNode(node)) {
			return node;
		}

		const kernel = getKernel(node);
		const cursor = kernel.getOrCreateInnerNode().borrowCursor();

		// To handle when the node transitively contains unknown optional fields,
		// derive the context from the source node's stored schema which has stored schema for any such fields and their contents.
		const flexContext = new UnhydratedContext(
			defaultSchemaPolicy,
			kernel.context.flexContext.schema,
		);
		const context = new Context(flexContext, getUnhydratedContext(kernel.schema).schema);

		const fieldSchema: TreeFieldStoredSchema = {
			kind: FieldKinds.required.identifier,
			types: new Set([brand(kernel.schema.identifier)]),
			persistedMetadata: undefined,
		};
		return createFromCursor(kernel.schema, cursor, fieldSchema, context) as Unhydrated<
			TreeFieldFromImplicitField<TSchema>
		>;
	},

	create<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		data: InsertableTreeFieldFromImplicitField<TSchema>,
	): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
		const mapTree = unhydratedFlexTreeFromInsertable(
			data as InsertableContent | undefined,
			schema,
		);
		const result = mapTree === undefined ? undefined : getOrCreateNodeFromInnerNode(mapTree);
		return result as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
	},
};
