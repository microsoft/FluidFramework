/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// All types imported into this file inherit the requirements documented below.
// These imports are ok because they consist only of type aliases for primitive types,
// and thus have no impact on serialization as long as the primitive type they are an alias for does not change.
// This does mean that the various UuidString types must remain strings, and must never change the format unless the process for changing
// persisted types (as documented below) is followed.
import { Serializable } from '@fluidframework/datastore-definitions';
import { Definition, DetachedSequenceId, EditId, NodeId, TraitLabel } from '../Identifiers';

/**
 * Types for Edits in Fluid Ops and Fluid summaries.
 *
 * Types describing locations in the tree are stable in the presence of other concurrent edits.
 *
 * All types are compatible with Fluid Serializable.
 *
 * These types can only be modified in ways that are both backwards and forwards compatible since they
 * are used in edits, and thus are persisted (using Fluid serialization).
 *
 * This means these types cannot be changed in any way that impacts their Fluid serialization
 * except through a very careful process:
 *
 * 1. The planned change must support all old data, and maintain the exact semantics of it.
 * This means that the change is pretty much limited to adding optional fields,
 * or making required fields optional.
 * 2. Support for the new format must be deployed to all users (This means all applications using SharedTree must do this),
 * and this deployment must be confirmed to be stable and will not be rolled back.
 * 3. Usage of the new format may start.
 *
 * Support for the old format can NEVER be removed: it must be maintained indefinably or old documents will break.
 * Because this process puts requirements on applications using shared tree,
 * step 3 should only ever be done in a Major version update,
 * and must be explicitly called out in the release notes
 * stating which versions of SharedTree are supported for documents modified by the new version.
 */

/**
 * A collection of changes to the tree that are applied atomically along with a unique identifier for the edit.
 * If any individual change fails to apply, the entire Edit will fail to apply.
 * @public
 */
export interface Edit<TChange> extends EditBase<TChange> {
	/**
	 * Unique identifier for this edit. Must never be reused.
	 * Used for referencing and de-duplicating edits.
	 */
	readonly id: EditId;
}

/**
 * A collection of changes to the tree that are applied atomically. If any individual change fails to apply,
 * the entire Edit will fail to apply.
 * @public
 */
export interface EditWithoutId<TChange> extends EditBase<TChange> {
	/**
	 * Used to explicitly state that EditWithoutId cannot contain an id and prevents type Edit from being assigned to type EditWithoutId.
	 */
	readonly id?: never;
}

/**
 * The information included in an edit.
 * @public
 */
export interface EditBase<TChange> {
	/**
	 * Actual changes to apply.
	 * Applied in order as part of a single transaction.
	 */
	readonly changes: readonly TChange[];

	// Add more metadata fields as needed in the future.
	// Include "high level"/"Domain Specific"/"Hierarchal" edits for application/domain use in implementing domain aware merge heuristics.
}

/**
 * Json compatible map as object.
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @public
 */
export interface TraitMap<TChild> {
	readonly [key: string]: TreeNodeSequence<TChild>;
}

/**
 * A sequence of Nodes that make up a trait under a Node
 * @public
 */
export type TreeNodeSequence<TChild> = readonly TChild[];

/**
 * Json compatible representation of a payload storing arbitrary Serializable data.
 *
 * Keys starting with "IFluid" are reserved for special use such as the JavaScript feature detection pattern and should not be used.
 *
 * See {@link comparePayloads} for equality semantics and related details (like what is allowed to be lost when serializing)
 *
 * TODO:#51984: Allow opting into heuristic blobbing in snapshots with a special IFluid key.
 *
 * @public
 */
export type Payload = Serializable;

/**
 * The fields required by a node in a tree
 * @public
 */
export interface NodeData {
	readonly payload?: Payload;

	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * Typically use to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 */
	readonly definition: Definition;

	/**
	 * Identifier which can be used to refer to this Node.
	 */
	readonly identifier: NodeId;
}

/**
 * Satisfies `NodeData` and may contain children under traits (which may or may not be `TreeNodes`)
 * @public
 */
export interface TreeNode<TChild> extends NodeData {
	readonly traits: TraitMap<TChild>;
}

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @public
 */
export interface TraitLocation {
	readonly parent: NodeId;
	readonly label: TraitLabel;
}

/**
 * JSON-compatible Node type. Objects of type `ChangeNode` will be persisted in `Changes` (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode = TreeNode<ChangeNode>;

/**
 * Node or sequence of Nodes for use in a Build change.
 *
 * Other formats for sub-sequences of Nodes can be added here, and those formats should be supported in blobs as well.
 * Future formats will include referenced blobs containing sequences of Nodes,
 * template based metadata and identity deduplication, and possibly compressed and binary formats.
 * These optimized formats should also be used within tree views.
 * @public
 */
export type BuildNode = TreeNode<BuildNode> | DetachedSequenceId;

/**
 * The status code of an attempt to apply the changes in an Edit.
 * @public
 */
export enum EditStatus {
	/**
	 * The edit contained one or more malformed changes (e.g. was missing required fields such as `id`),
	 * or contained a sequence of changes that could not possibly be applied sequentially without error
	 * (e.g. an edit which tries to insert the same detached node twice).
	 */
	Malformed,
	/**
	 * The edit contained a well-formed sequence of changes that couldn't be applied to the current view,
	 * generally because concurrent changes caused one or more merge conflicts.
	 */
	Invalid,
	/**
	 * The edit was applied to the current view successfully.
	 */
	Applied,
}

/**
 * Types of ops handled by SharedTree.
 */
export enum SharedTreeOpType {
	/** An op that includes edit information. */
	Edit,
	/** Includes a Fluid handle that corresponds to an edit chunk. */
	Handle,
	/** An op that does not affect the tree's state. */
	NoOp,
}

/**
 * Requirements for SharedTree ops.
 */
export interface SharedTreeOp {
	readonly type: SharedTreeOpType;
}

/**
 * A SharedTree op that includes edit information.
 */
export interface SharedTreeEditOp<TChange> extends SharedTreeOp {
	readonly edit: Edit<TChange>;
}

/**
 * A SharedTree op that includes edit handle information.
 * The handle corresponds to an edit chunk in the edit log.
 */
export interface SharedTreeHandleOp extends SharedTreeOp {
	/** The serialized handle to an uploaded edit chunk. */
	readonly editHandle: string;
	/** The index of the first edit in the chunk that corresponds to the handle. */
	readonly startRevision: number;
}
