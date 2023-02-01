import { RevisionTag } from "../../core";
import { Brand, NestedSet } from "../../util";

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
	 * Calling this records a dependency for the current field on this key.
	 */
	get(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
	): T | undefined;

	/**
	 * If there is no data for this key, sets the value to `newValue`.
	 * Then returns the data for this key.
	 * All fields which took a dependency on this key will be considered invalidated
	 * and will be given a chance to address the new data in `amendRebase`, `amendInvert`, or `amendCompose`,
	 * as appropriate.
	 */
	getOrCreate(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		newValue: T,
	): T;
}

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 * @alpha
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;
