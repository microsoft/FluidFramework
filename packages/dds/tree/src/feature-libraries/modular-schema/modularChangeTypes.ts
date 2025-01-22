/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	subtractChangeAtomIds,
	type ChangeAtomId,
	type ChangesetLocalId,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionTag,
} from "../../core/index.js";
import { brand, RangeMap, type Brand, type TupleBTree } from "../../util/index.js";
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

	// XXX: Should we merge builds and destroys into this?
	readonly rootNodes: RootRange[];

	// XXX: Could this be merged with nodeAliases?
	// XXX: Need to make sure whenever we split a range we also split the value of the range
	readonly nodeRenames: NodeRenameTable;

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
	 * If this count is greater than 0, it will prevent the changeset from being applied.
	 */
	readonly constraintViolationCount?: number;
	/**
	 * The number of constraint violations that apply to the revert of the changeset. If this count is greater than 0, it will
	 * prevent the changeset from being reverted or undone.
	 */
	readonly constraintViolationCountOnRevert?: number;
	readonly builds?: ChangeAtomIdBTree<TreeChunk>;
	readonly destroys?: ChangeAtomIdBTree<number>;
	readonly refreshers?: ChangeAtomIdBTree<TreeChunk>;
}

export interface NodeRenameTable {
	oldToNewId: CrossFieldRangeTable<ChangeAtomId>;
	newToOldId: CrossFieldRangeTable<ChangeAtomId>;
}

export interface RootRange {
	idBefore: ChangeAtomId | undefined;
	idTransient: ChangeAtomId | undefined;
	idAfter: ChangeAtomId | undefined;
	count: number;
}

export type ChangeAtomIdBTree<V> = TupleBTree<[RevisionTag | undefined, ChangesetLocalId], V>;

export type CrossFieldRangeTable<T> = RangeMap<CrossFieldKey, T>;
export type CrossFieldKeyTable = CrossFieldRangeTable<FieldId>;

export function newCrossFieldRangeTable<V>(): CrossFieldRangeTable<V> {
	return new RangeMap<CrossFieldKey, V>(offsetCrossFieldKey, subtractCrossFieldKeys);
}

function offsetCrossFieldKey(key: CrossFieldKey, offset: number): CrossFieldKey {
	return {
		...key,
		localId: brand(key.localId + offset),
	};
}

function subtractCrossFieldKeys(a: CrossFieldKey, b: CrossFieldKey): number {
	const cmpTarget = a.target - b.target;
	if (cmpTarget !== 0) {
		return cmpTarget * Number.POSITIVE_INFINITY;
	}

	return subtractChangeAtomIds(a, b);
}

export interface CrossFieldKey extends ChangeAtomId {
	readonly target: CrossFieldTarget;
}

export interface CrossFieldKeyRange {
	key: CrossFieldKey;
	count: number;
}

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
	/** Keeps track of whether node exists constraint will be violated when this change is reverted */
	nodeExistsConstraintOnRevert?: NodeExistsConstraint;
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
