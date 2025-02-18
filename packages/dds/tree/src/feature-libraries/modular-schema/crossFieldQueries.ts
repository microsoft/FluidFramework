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
	invertDetach(detachId: ChangeAtomId, count: number, nodeChanges: NodeId | undefined): void;
	invertAttach(
		attachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry>;
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

	composeDetachAttach(baseDetachId: ChangeAtomId, count: number): void;
}

export interface RebaseNodeManager<T = unknown> {
	// XXX: We need to know if a new detach is now happening in this field
	getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, DetachedNodeEntry<T>>;

	// XXX: We need to know if a detach is no longer happening with in field
	rebaseOverDetach(
		baseDetachId: ChangeAtomId,
		count: number,
		newDetachId: ChangeAtomId | undefined,
		nodeChange: NodeId | undefined,
		fieldData: T | undefined,
	): void;
}

export interface DetachedNodeEntry<T = unknown> {
	nodeChange?: NodeId;
	fieldData?: T;
}
