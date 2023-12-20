/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, NestedMap, RangeMap } from "../../util";
import { RevisionTag } from "../../core";

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 * @internal
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * A globally unique ID for an atom of change, or a node associated with the atom of change.
 * @internal
 *
 * @privateRemarks
 * TODO: Rename this to be more general.
 */
export interface ChangeAtomId {
	/**
	 * Uniquely identifies the changeset within which the change was made.
	 * Only undefined when referring to an anonymous changesets.
	 */
	readonly revision?: RevisionTag;
	/**
	 * Uniquely identifies, in the scope of the changeset, the change made to the field.
	 */
	readonly localId: ChangesetLocalId;
}

/**
 * @internal
 */
export type ChangeAtomIdMap<T> = NestedMap<RevisionTag | undefined, ChangesetLocalId, T>;

/**
 * @internal
 */
export type ChangeAtomIdRangeMap<T> = Map<RevisionTag | undefined, RangeMap<T>>;
