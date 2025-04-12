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
	 * This must be called for each detach in the field kind when rolling-back or undoing an detach.
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

	/**
	 * Gets the node changes associated with the node being attached in input changeset.
	 *
	 * This must be called for each attach in the field kind when rolling-back or undoing an attach.
	 * This implies that all attaches in the field must be inverted.
	 * @param attachId - The ID of the attach to invert.
	 * @param count - The number of nodes being attached.
	 * @param invertRenames - Whether to invert the renames associated with this attach.
	 */
	invertAttach(
		attachId: ChangeAtomId,
		count: number,
		invertRenames: boolean,
	): RangeQueryResult<ChangeAtomId, NodeId>;
}

export interface ComposeNodeManager {
	/**
	 * Allows a field kind to query nested changes associated with a node in the input context of the new changeset.
	 * This should be called for every detach in the base changeset.
	 * @param baseDetachId - The ID of the detach in the base changeset.
	 * @param count - The number of nodes being detached.
	 */
	getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId>;

	/**
	 * Must be called by a field kind when composing an attach in the base changeset with a detach in the new changeset.
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
	 * Must be called by a field kind when composing an attach in the base changeset with nested changes the new changeset.
	 * @param baseAttachId - The ID of the attach in the base changeset.
	 * @param newChanges - The ID of the nested changes associated with this node in the new changeset.
	 */
	sendNewChangesToBaseSourceLocation(baseAttachId: ChangeAtomId, newChanges: NodeId): void;

	/**
	 * This should be called whenever the detach of a range of nodes is being composed with an attach potentially corresponding to the same nodes.
	 * Returns whether the node being attached is the same node being detached.
	 */
	// XXX: This should return a range result, since only some of the nodes might be the same?
	/**
	 * Must be called by a field kind when composing a detach in the base changeset with an attach in the new changeset.
	 * @param baseDetachId - The ID of the detach in the base changeset.
	 * @param newAttachId - The ID of the attach in the new changeset.
	 * @param count - The number of nodes being detached then attached.
	 */
	composeDetachAttach(
		baseDetachId: ChangeAtomId,
		newAttachId: ChangeAtomId,
		count: number,
	): boolean;
}

export interface RebaseNodeManager {
	/**
	 * Must be called by a field kind when rebasing over an attach.
	 * The returned child changes and detach intentions must be represented in the output changeset.
	 * @param baseAttachId - The ID of the attach that is being rebased over.
	 * @param count - The number of nodes attached by the base attach.
	 * @returns The new nested changes and detach intentions associated with the node in the changeset being rebased.
	 */
	getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry>;

	/**
	 * Must be called by a field kind when rebasing over a detach.
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
}

export interface DetachedNodeEntry {
	nodeChange?: NodeId;
	detachId?: ChangeAtomId;
}
