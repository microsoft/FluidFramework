/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BTree } from "@tylerbu/sorted-btree-es6";
import type {
	ChangeAtomId,
	ChangeAtomIdMap,
	ChangesetLocalId,
	FieldKey,
	FieldKindIdentifier,
	RevisionInfo,
	RevisionTag,
} from "../../core/index.js";
import type { Brand } from "../../util/index.js";
import type { TreeChunk } from "../chunked-forest/index.js";
import type { CrossFieldTarget } from "./crossFieldQueries.js";

/**
 * @internal
 */
export interface ModularChangeset extends HasFieldChanges {
	/**
	 * The numerically highest `ChangesetLocalId` used in this changeset.
	 * If undefined then this changeset contains no IDs.
	 */
	readonly maxId?: ChangesetLocalId;
	/**
	 * The revisions included in this changeset, ordered temporally (oldest to newest).
	 * Undefined for anonymous changesets.
	 * Should never be empty.
	 */
	readonly revisions?: readonly RevisionInfo[];
	readonly fieldChanges: FieldChangeMap;

	/**
	 * Maps from this changeset's canonical ID for a node (see comment on node aliases) to the changes for that node.
	 */
	readonly nodeChanges: ChangeAtomIdMap<NodeChangeset>;

	/**
	 * Maps from this changeset's canonical ID for a node to the ID for the field which contains that node.
	 */
	// TODO: Should this be merged with `nodeChanges`?
	readonly nodeToParent: ChangeAtomIdMap<FieldId>;

	/**
	 * Maps from a node ID to another ID for the same node.
	 * If a node ID used in this changeset has no entry in this table, then it is the canonical ID for that node.
	 * The aliases form a set of trees, where the root of each tree is a canonical ID.
	 *
	 * When composing changesets with different canonical IDs for the same node,
	 * one of those IDs becomes the canonical ID for the composition, while the other is added to this table as an alias.
	 *
	 * Node aliases are preserved when composing changesets so we can avoid having to find and update all changed node IDs
	 * in the field IDs in nodeToParent and crossFieldKeys.
	 */
	readonly nodeAliases: ChangeAtomIdMap<NodeId>;
	readonly crossFieldKeys: CrossFieldKeyTable;
	readonly constraintViolationCount?: number;
	readonly builds?: ChangeAtomIdMap<TreeChunk>;
	readonly destroys?: ChangeAtomIdMap<number>;
	readonly refreshers?: ChangeAtomIdMap<TreeChunk>;
}

export type TupleBTree<K, V> = Brand<BTree<K, V>, "TupleBTree">;
export type CrossFieldKeyTable = TupleBTree<CrossFieldKeyRange, FieldId>;
export type CrossFieldKeyRange = readonly [
	CrossFieldTarget,
	RevisionTag | undefined,
	ChangesetLocalId,
	/**
	 * The length of this range.
	 * TODO: This does not need to be part of the key and could be part of the value instead.
	 */
	number,
];

export type CrossFieldKey = readonly [
	CrossFieldTarget,
	RevisionTag | undefined,
	ChangesetLocalId,
];

export interface FieldId {
	readonly nodeId: NodeId | undefined;
	readonly field: FieldKey;
}

/**
 * @internal
 */
export interface NodeExistsConstraint {
	violated: boolean;
}

/**
 * Changeset for a subtree rooted at a specific node.
 * @internal
 */
export interface NodeChangeset extends HasFieldChanges {
	nodeExistsConstraint?: NodeExistsConstraint;
}

export type NodeId = ChangeAtomId;

/**
 * @internal
 */
export interface HasFieldChanges {
	fieldChanges?: FieldChangeMap;
}

/**
 * @internal
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 * @internal
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

/**
 * @internal
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
