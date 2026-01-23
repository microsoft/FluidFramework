/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	areEqualChangeAtomIds,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type ChangesetLocalId,
	type RevisionReplacer,
	type RevisionTag,
} from "../../core/index.js";
import {
	brand,
	brandConst,
	newIntegerRangeMap,
	type RangeMap,
	type Mutable,
	hasSome,
} from "../../util/index.js";

const offsetChangesetLocalId = (value: ChangesetLocalId, offset: number): ChangesetLocalId =>
	brand(value + offset);

export class DefaultRevisionReplacer implements RevisionReplacer {
	/**
	 * Mapping from (obsolete revision tag, original local id) to the updated local id.
	 */
	private readonly updatedLocalIds: ChangeAtomIdRangeMap<ChangesetLocalId> =
		newChangeAtomIdRangeMap(offsetChangesetLocalId);
	/**
	 * The set of local IDs already used in the scope of the updated revision.
	 */
	private readonly localIds: RangeMap<ChangesetLocalId, true> = newIntegerRangeMap();
	/**
	 * The maximum local ID seen so far in the scope of the updated revision.
	 */
	private maxSeen: ChangesetLocalId = brandConst(-1)();

	public constructor(
		public readonly updatedRevision: RevisionTag,
		private readonly obsoleteRevisions: Set<RevisionTag | undefined>,
	) {}

	public isObsolete(revision: RevisionTag | undefined): boolean {
		return this.obsoleteRevisions.has(revision);
	}

	public getUpdatedAtomId<T extends ChangeAtomId>(id: T, count: number = 1): T {
		assert(count >= 1, "Count must be at least 1");
		if (this.isObsolete(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.updatedRevision };
			const priors = this.updatedLocalIds.getAll(id, count);
			// const lastId = offsetChangeAtomId(id, count - 1);
			//  const upperBound = getPairOrNextLowerFromChangeAtomIdMap(this.updatedLocalIds, lastId);
			if (hasSome(priors)) {
				const consolidated = { ...priors[0] };
				for (const entry of priors.slice(1)) {
					if (
						areEqualChangeAtomIds(
							entry.start,
							offsetChangeAtomId(consolidated.start, consolidated.length),
						) &&
						entry.value === consolidated.value + consolidated.length
					) {
						consolidated.length += entry.length;
					} else {
						break;
					}
				}
				if (consolidated.length === count) {
					updated.localId = consolidated.value;
				} else {
					fail("TODO: handle partially updated range");
				}
			} else {
				let localId: ChangesetLocalId;
				if (this.localIds.getAll(id.localId, count).length > 0) {
					localId = brand(this.maxSeen + 1);
					this.maxSeen = brand(localId + count - 1);
				} else {
					// This change atom ID uses a local ID that has not yet been used in the scope of the updated revision.
					// We reuse it as is to minimize the number of IDs that need to be updated.
					localId = id.localId;
					this.maxSeen = brand(Math.max(this.maxSeen, localId + count - 1));
					this.localIds.set(id.localId, count, true);
				}
				this.updatedLocalIds.set(id, count, localId);
				updated.localId = localId;
			}
			return updated;
		}
		return id;
	}
}
