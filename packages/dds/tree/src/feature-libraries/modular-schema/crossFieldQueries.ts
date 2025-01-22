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
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId, T> {
	return map.getFirst(id, count);
}

/**
 */
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
	getChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId>;

	composeBaseAttach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId | undefined,
		count: number,
		newChanges: NodeId | undefined,
	): void;
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
		nodeChange: NodeId | undefined,
		fieldData: T | undefined,
	): void;
}

export interface DetachedNodeEntry<T = unknown> {
	nodeChange?: NodeId;
	fieldData?: T;
	currentId?: ChangeAtomId;
	newId?: ChangeAtomId;

	// XXX: Tree for build
}
