/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, ChangeAtomIdRangeMap } from "../../core/index.js";
import type { RangeQueryResult } from "../../util/index.js";
import type { NodeId } from "./modularChangeTypes.js";

export type CrossFieldMap<T> = ChangeAtomIdRangeMap<T>;
export type CrossFieldQuerySet = CrossFieldMap<boolean>;

export function setInCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	id: ChangeAtomId,
	count: number,
	value: T,
): void {
	map.set(id, count, value);
}

// TODO: Rename to NodeMoveType(Attach | Detach)
export enum CrossFieldTarget {
	Source,
	Destination,
}

export interface InvertNodeManager {
	/**
	 * Transfers the given node changes from the input context of the field changeset being inverted to the input context of the detached space (from which it may be further moved).
	 *
	 * This must be called for each detach in the field kind when rolling or undoing an detach.
	 * This implies that all detaches in the field must be inverted.
	 * @param detachId - The ID of the detach to invert.
	 * @param count - The number of nodes being detached.
	 * @param nodeChanges - The node changes to transfer.
	 * @param newAttachId - The ID that the nodes will be attached with in the inverted changeset of this field.
	 */
	invertDetach(
		detachId: ChangeAtomId,
		count: number,
		nodeChanges: NodeId | undefined,
		newAttachId: ChangeAtomId,
	): void;

	invertAttach(
		attachId: ChangeAtomId,
		count: number,
		invertRenames: boolean,
	): RangeQueryResult<ChangeAtomId, NodeId>;
}

export interface ComposeNodeManager {
	getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId>;

	composeBaseAttach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId | undefined,
		count: number,
		newChanges: NodeId | undefined,
	): void;

	/**
	 * This should be called whenever the detach of a range of nodes is being composed with an attach potentially corresponding to the same nodes.
	 * Returns whether the node being attached is the same node being detached.
	 */
	// XXX: This should return a range result, since only some of the nodes might be the same?
	composeDetachAttach(
		baseDetachId: ChangeAtomId,
		newAttachId: ChangeAtomId,
		count: number,
	): boolean;
}

export interface RebaseNodeManager {
	// XXX: Support moving cross field keys
	getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry>;

	// XXX: Support moving/deleting cross field keys
	rebaseOverDetach(
		baseDetachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId | undefined,
		nodeChange: NodeId | undefined,
	): void;
}

export interface DetachedNodeEntry {
	nodeChange?: NodeId;
	detachId?: ChangeAtomId;
}
