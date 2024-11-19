/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, RevisionTag } from "../../core/index.js";
import {
	type RangeMap,
	type RangeQueryResult,
	getFromRangeMap,
	getOrAddInMap,
	setInRangeMap,
} from "../../util/index.js";
import type { NodeId } from "./modularChangeTypes.js";

export type CrossFieldMap<T> = Map<RevisionTag | undefined, RangeMap<T>>;
export type CrossFieldQuerySet = CrossFieldMap<boolean>;

export function setInCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	{ revision, localId }: ChangeAtomId,
	count: number,
	value: T,
): void {
	setInRangeMap(getOrAddInMap(map, revision, []), localId, count, value);
}

export function getFirstFromCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	{ revision, localId }: ChangeAtomId,
	count: number,
): RangeQueryResult<T> {
	return getFromRangeMap(map.get(revision) ?? [], localId, count);
}

/**
 */
export enum CrossFieldTarget {
	Source,
	Destination,
}

export interface InvertNodeManager {
	invertDetach(detachId: ChangeAtomId, count: number, nodeChanges: NodeId | undefined): void;
	invertAttach(attachId: ChangeAtomId, count: number): RangeQueryResult<DetachedNodeEntry>;
}

export interface ComposeNodeManager {
	getChangesForBaseDetach(baseDetachId: ChangeAtomId, count: number): RangeQueryResult<NodeId>;

	composeBaseAttach(
		baseAttachId: ChangeAtomId,
		newDetachId: ChangeAtomId | undefined,
		count: number,
		newChanges: NodeId,
	): void;
}

export interface RebaseNodeManager<T = unknown> {
	// XXX: We need to know if a new detach is now happening in this field
	getNewChangesForBaseAttach(
		baseAttachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<DetachedNodeEntry<T>>;

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
}
