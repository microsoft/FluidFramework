/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BTree } from "@tylerbu/sorted-btree-es6";
import type {
	ChangeAtomId,
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
	readonly nodeChanges: ChangeAtomIdBTree<NodeChangeset>;

	/**
	 * Maps from this changeset's canonical ID for a node to the ID for the field which contains that node.
	 */
	// TODO: Should this be merged with `nodeChanges`?
	readonly nodeToParent: ChangeAtomIdBTree<FieldId>;

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
	readonly nodeAliases: ChangeAtomIdBTree<NodeId>;
	readonly crossFieldKeys: CrossFieldKeyTable;
	/**
	 * The number of constraint violations that apply to the input context of the changeset, i.e., before this change is applied.
	 * If this count is > 0, it will prevent the changeset from being applied.
	 */
	readonly constraintViolationCount?: number;
	/**
	 * The number of constraint violations that apply to the inverse of the changeset, i.e., when the inverse of this
	 * changeset is applied. If this count is > 0, it will prevent the changeset from being reverted or undone.
	 */
	readonly inverseConstraintViolationCount?: number;
	readonly builds?: ChangeAtomIdBTree<TreeChunk>;
	readonly destroys?: ChangeAtomIdBTree<number>;
	readonly refreshers?: ChangeAtomIdBTree<TreeChunk>;
}

export type TupleBTree<K, V> = Brand<BTree<K, V>, "TupleBTree">;
export type ChangeAtomIdBTree<V> = TupleBTree<[RevisionTag | undefined, ChangesetLocalId], V>;
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
 */
export interface NodeExistsConstraint {
	violated: boolean;
}

/**
 * Changeset for a subtree rooted at a specific node.
 */
export interface NodeChangeset extends HasFieldChanges {
	/** Keeps track of whether node exists constraint has been violated by this change */
	nodeExistsConstraint?: NodeExistsConstraint;
	/** Keeps track of whether node exists constraint will be violated when this change is inverted */
	inverseNodeExistsConstraint?: NodeExistsConstraint;
}

export type NodeId = ChangeAtomId;

/**
 */
export interface HasFieldChanges {
	fieldChanges?: FieldChangeMap;
}

/**
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

/**
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
