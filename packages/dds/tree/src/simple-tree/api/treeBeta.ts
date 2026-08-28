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
import { TreeAlpha } from "../../shared-tree/index.js";
import { brand } from "../../util/index.js";
import {
	Context,
	getKernel,
	getOrCreateNodeFromInnerNode,
	isTreeNode,
	UnhydratedContext,
	type TreeLeafValue,
	type TreeNode,
	type Unhydrated,
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
import type { InsertableField, UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";

import { conciseFromCursor, type ConciseTree } from "./conciseTree.js";
import { createFromCursor } from "./create.js";
import type { TreeEncodingOptions } from "./customTree.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by docs
import type { ObjectSchemaOptions } from "./schemaFactory.js";
import type { TreeChangeEventsBeta } from "./treeChangeEventsBeta.js";
import type { TreeContextBeta } from "./tree.js";
import { treeNodeApi } from "./treeNodeApi.js";
import { cursorFromVerbose } from "./verboseTree.js";

// Tests for this file are grouped with those for treeNodeApi.ts as that is where this functionality will eventually land,
// and where most of the actual implementation is for much of it.

/**
 * Extensions to {@link (Tree:interface)} which are not yet stable.
 * @remarks
 * Use via the {@link (TreeBeta:variable)} singleton.
 * @sealed @beta
 */
export interface TreeBeta {
	/**
	 * Retrieve the {@link TreeContextBeta | context} for the given node.
	 * @param node - The node to query.
	 */
	context(node: TreeNode): TreeContextBeta;

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
	 * - If the node (or any node in its subtree) contains {@link ObjectSchemaOptions.allowUnknownOptionalFields|unknown optional fields},
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
	const cursor = kernel.getInnerNode().borrowCursor();
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
	context(node: TreeNode): TreeContextBeta {
		return TreeAlpha.context(node);
	},

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
		const cursor = kernel.getInnerNode().borrowCursor();

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
