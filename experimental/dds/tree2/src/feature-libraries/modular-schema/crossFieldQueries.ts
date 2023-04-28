/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { brand, brandedNumberType, Brand, NestedSet } from "../../util";
import { IdAllocator } from "./fieldChangeHandler";

export type CrossFieldQuerySet = NestedSet<RevisionTag | undefined, ChangesetLocalId>;

/**
 * @alpha
 */
export enum CrossFieldTarget {
	Source,
	Destination,
}

/**
 * Used by {@link FieldChangeHandler} implementations for exchanging information across other fields
 * while rebasing, composing, or inverting a change.
 * @alpha
 */
export interface CrossFieldManager<T = unknown> {
	/**
	 * Returns the data associated with triplet key of `target`, `revision`, and `id`.
	 * Calling this records a dependency for the current field on this key if `addDependency` is true.
	 */
	get(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		addDependency: boolean,
	): T | undefined;

	/**
	 * If there is no data for this key, sets the value to `newValue`.
	 * Then returns the data for this key.
	 * If `invalidateDependents` is true, all fields which took a dependency on this key will be considered invalidated
	 * and will be given a chance to address the new data in `amendRebase`, `amendInvert`, or `amendCompose`,
	 * as appropriate.
	 */
	getOrCreate(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		newValue: T,
		invalidateDependents: boolean,
	): T;
}

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 * @alpha
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;
export const ChangesetLocalIdSchema = brandedNumberType<ChangesetLocalId>();

export interface IdAllocationState {
	maxId: ChangesetLocalId;
}

/**
 * @alpha
 */
export function idAllocatorFromMaxId(maxId: ChangesetLocalId | undefined = undefined): IdAllocator {
	return idAllocatorFromState({ maxId: maxId ?? brand(-1) });
}

export function idAllocatorFromState(state: IdAllocationState): IdAllocator {
	return (c?: number) => {
		const count = c ?? 1;
		assert(count > 0, 0x5cf /* Must allocate at least one ID */);
		const id: ChangesetLocalId = brand((state.maxId as number) + 1);
		state.maxId = brand((state.maxId as number) + count);
		return id;
	};
}
