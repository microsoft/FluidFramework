/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	ChangeAtomIdRangeMap,
	ChangesetLocalId,
	RevisionTag,
} from "../../core/index.js";
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

export function getFirstFromCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
): RangeQueryResult<T | undefined> {
	return map.getFirst({ revision, localId: id }, count);
}

export enum NodeMoveType {
	Detach,
	Attach,
}

export interface InvertNodeManager {
	/**
	 * Transfers the given node changes from the input context of the field changeset being inverted to the input context of the detached space (from which it may be further moved).
	 *
	 * This must be called for each range of detaches in the field.
	 * The inverted field change must contain an attach using `this.getInvertedMoveId(detachId)` as its ID.
	 * @param detachId - The ID of the detach to invert.
	 * @param count - The number of nodes being detached.
	 * @param nodeChanges - The node changes to transfer.
	 */
	invertDetach(detachId: ChangeAtomId, count: number, nodeChanges: NodeId | undefined): void;

	/**
	 * Gets the node changes associated with the node being attached in input changeset.
	 *
	 * This must be called for each range of attaches in the field.
	 * If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 * The inverted field change must contain a detach using `this.getInvertedMoveId(attachId)` as its ID.
	 * @param attachId - The ID of the attach to invert.
	 * @param count - The number of nodes being attached.
	 * @remarks If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 */
	invertAttach(attachId: ChangeAtomId, count: number): RangeQueryResult<NodeId | undefined>;

	getInvertedMoveId(id: ChangeAtomId): ChangeAtomId;
}

export interface ComposeNodeManager {
	/**
	 * Allows a field kind to query nested changes associated with a node in the input context of the new changeset.
	 * This must be called for every range of detaches in the base changeset.
	 * If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 * @param baseDetachId - The ID of the detach in the base changeset.
	 * @param count - The number of nodes being detached.
	 * @remarks If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 */
	getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<NodeId | undefined>;

	/**
	 * Must be called for each range of attaches in the base changeset which compose with detaches in the new changeset.
	 * If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 * This allows Modular Change Family to keep track of how a given node is being renamed.
	 * @param baseAttachId - The ID of the attach in the base changeset.
	 * @param newDetachId - The ID of the detach in the new changeset.
	 * @param count - The number of nodes being attached then detached.
	 */
	composeAttachDetach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId,
		count: number,
	): void;

	/**
	 * Must be called for each attach in the base changeset which composes with nested changes the new changeset.
	 *
	 * This is needed because child changes are represented at the location of the node they impact in the input context of a changeset.
	 * So if the later of the two changes being composed carries nested changes for a node,
	 * then in the composed changeset, these nested changes need to be represented at the location of that node in the input context of the composed changeset.
	 *
	 * @param baseAttachId - The ID of the attach in the base changeset.
	 * @param newChanges - The ID of the nested changes associated with this node in the new changeset.
	 */
	sendNewChangesToBaseSourceLocation(baseAttachId: ChangeAtomId, newChanges: NodeId): void;
}

export interface RebaseNodeManager {
	/**
	 * Must be called for each range of attaches.
	 * If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 * The returned child changes and detach intentions must be represented in the output changeset.
	 * @param baseAttachId - The ID of the attach that is being rebased over.
	 * @param count - The number of nodes attached by the base attach.
	 * @returns The new nested changes and detach intentions associated with the node in the changeset being rebased.
	 * @remarks If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 */
	getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<DetachedNodeEntry | undefined>;

	// XXX: It's not clear if this must be called even when newDetachId and nodeChange are undefined.
	// XXX: It's not clear if it's okay to call this once with a newDetachId then once with a nodeChange.
	// XXX: It's not clear if nodeChange should be rebased already, or should not be rebased, or if it doesn't matter.
	/**
	 * Must be called for each range of detaches in the base changeset.
	 * If the length of the result is less than `count`, this must be called again for the remainder of the range.
	 * The field kind must provide the nested changes and detach intentions associated with the node in the changeset being rebased.
	 * @param baseDetachId - The ID of the detach that is being rebased over.
	 * @param count - The number of nodes detached by the base detach.
	 * @param newDetachId - The ID associated the detach intention (if any) for these nodes in the rebased changeset.
	 * @param nodeChange - The nested changes (if any) associated with this node in the rebased changeset.
	 */
	rebaseOverDetach(
		baseDetachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId | undefined,
		nodeChange: NodeId | undefined,
	): void;

	/**
	 * This must be called for each range of detaches present in the rebased field change which were not in the original change.
	 * Calling this for detaches which were also in the original change is tolerated.
	 */
	addDetach(id: ChangeAtomId, count: number): void;
	/**
	 * This must be called for each range of detaches not present in the rebased change which were in the original change.
	 */
	removeDetach(id: ChangeAtomId, count: number): void;

	/**
	 * Returns whether nodes which were either previously detached by `id` or the base changeset is now detaching with `id`
	 * are also reattached by the base changeset.
	 */
	doesBaseAttachNodes(id: ChangeAtomId, count: number): RangeQueryResult<boolean>;

	/**
	 * Returns the root ID the base change renames `id` to, if any.
	 */
	getBaseRename(id: ChangeAtomId, count: number): RangeQueryResult<ChangeAtomId | undefined>;

	/**
	 * Given a detached node ID in the base changeset's output context,
	 * returns the ID the rebased changeset renames that ID to, if any.
	 */
	getNewRenameForBaseRename(
		baseRenameTo: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId | undefined>;
}

export interface DetachedNodeEntry {
	readonly nodeChange?: NodeId;
	readonly detachId?: ChangeAtomId;
}
