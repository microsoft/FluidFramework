/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	subtractChangeAtomIds,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type ChangesetLocalId,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
} from "../../core/index.js";
import { brand, RangeMap, type Brand } from "../../util/index.js";
import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { TreeChunk } from "../chunked-forest/index.js";

import type { NodeMoveType } from "./crossFieldQueries.js";

export type RebaseVersion = 1 | 2;

export interface ModularChangeset extends HasFieldChanges {
	readonly rebaseVersion: RebaseVersion;

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
	readonly rootNodes: RootNodeTable;

	/**
	 * Maps from this changeset's canonical ID for a node to the ID for the field which contains that node,
	 * or the detach ID, if this node is detached.
	 */
	// TODO: Should this be merged with `nodeChanges`?
	readonly nodeToParent: ChangeAtomIdBTree<NodeLocation>;

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
	/** Constraint that the document must be in the same state before this change is applied as it was before this change was authored */
	readonly noChangeConstraint?: NoChangeConstraint;
	/** Constraint that the document must be in the same state before the revert of this change is applied as it was after this change was applied */
	readonly noChangeConstraintOnRevert?: NoChangeConstraint;
	/**
	 * The number of constraint violations that apply to the revert of the changeset. If this count is greater than 0, it will
	 * prevent the changeset from being reverted or undone.
	 */
	readonly constraintViolationCountOnRevert?: number;
	readonly builds?: ChangeAtomIdBTree<TreeChunk>;
	readonly destroys?: ChangeAtomIdBTree<number>;
	readonly refreshers?: ChangeAtomIdBTree<TreeChunk>;
}

export interface RootNodeTable {
	// TODO: Include builds, destroys, refreshers, and field changes
	oldToNewId: ChangeAtomIdRangeMap<ChangeAtomId>;
	newToOldId: ChangeAtomIdRangeMap<ChangeAtomId>;
	nodeChanges: ChangeAtomIdBTree<NodeId>;

	/**
	 * Maps from input context detach ID to the field where the node was last attached.
	 * There should be an entry for every detach ID referenced in `oldToNewId` or `nodeChanges`.
	 */
	detachLocations: ChangeAtomIdRangeMap<FieldId>;

	/**
	 * Maps from the output root ID of a node to the output detach location of that node.
	 * This is only guaranteed to contain entries for nodes which have an output detach location
	 * which is different from their location in the input context.
	 */
	outputDetachLocations: ChangeAtomIdRangeMap<FieldId>;
}

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
	readonly target: NodeMoveType;
}

export interface CrossFieldKeyRange {
	readonly key: CrossFieldKey;
	readonly count: number;
}

export interface FieldId {
	readonly nodeId: NodeId | undefined;
	readonly field: FieldKey;
}

export interface FieldParent {
	readonly field: FieldId;
	readonly root?: undefined;
}

export interface RootParent {
	readonly field?: undefined;
	readonly root: ChangeAtomId;
}

export type NodeLocation = FieldParent | RootParent;
export interface DetachLocation {
	field: FieldId;
	atomId: ChangeAtomId | undefined;
}

/**
 */
export interface NodeExistsConstraint {
	violated: boolean;
}

/**
 * A constraint that is violated whenever the state of the document is different from when the change was authored.
 */
export interface NoChangeConstraint {
	violated: boolean;
}

/**
 * Changeset for a subtree rooted at a specific node.
 */
export interface NodeChangeset extends HasFieldChanges {
	/** Keeps track of whether node exists constraint has been violated by this change */
	readonly nodeExistsConstraint?: NodeExistsConstraint;

	/** Keeps track of whether node exists constraint will be violated when this change is reverted */
	readonly nodeExistsConstraintOnRevert?: NodeExistsConstraint;
}

export type NodeId = ChangeAtomId;

export interface HasFieldChanges {
	readonly fieldChanges?: FieldChangeMap;
}

export type FieldChangeMap = Map<FieldKey, FieldChange>;

export interface FieldChange {
	readonly fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

export type FieldChangeset = Brand<unknown, "FieldChangeset">;
