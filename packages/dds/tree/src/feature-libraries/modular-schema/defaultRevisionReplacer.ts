/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type ChangesetLocalId,
	type RevisionReplacer,
	type RevisionTag,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
} from "../../core/index.js";
import {
	type Mutable,
	type RangeMap,
	brand,
	brandConst,
	newIntegerRangeMap,
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
		assert(count >= 1, 0xcc9 /* Count must be at least 1 */);
		if (this.isObsolete(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.updatedRevision };
			let continuingOutputId: ChangesetLocalId | undefined;
			let remainderCount = count;
			let remainderStart = id;
			while (remainderCount > 0) {
				const prior = this.updatedLocalIds.getFirst(remainderStart, remainderCount);
				if (prior.value === undefined) {
					const defaultOutputId = continuingOutputId ?? remainderStart.localId;
					const newLocalId =
						this.localIds.getAll(defaultOutputId, prior.length).length > 0
							? // Some of the IDs in this range have already been used in the scope of the updated revision.
								// We need to allocate new local IDs.
								brand<ChangesetLocalId>(this.maxSeen + 1)
							: // This change atom ID uses a local ID that has not yet been used in the scope of the updated revision.
								// We reuse it as is to minimize the number of IDs that need to be updated.
								defaultOutputId;

					this.maxSeen = brand(Math.max(this.maxSeen, newLocalId + prior.length - 1));
					this.localIds.set(newLocalId, prior.length, true);
					this.updatedLocalIds.set(remainderStart, prior.length, newLocalId);
					if (continuingOutputId === undefined) {
						updated.localId = newLocalId;
					} else if (newLocalId !== continuingOutputId) {
						fail(0xcca /* TODO: Handle non-contiguous ranges */);
					}
					continuingOutputId = offsetChangesetLocalId(newLocalId, prior.length);
				} else {
					if (continuingOutputId === undefined) {
						updated.localId = prior.value;
					} else if (prior.value !== continuingOutputId) {
						fail(0xccb /* TODO: Handle non-contiguous ranges */);
					}
					continuingOutputId = offsetChangesetLocalId(prior.value, prior.length);
				}
				remainderStart = offsetChangeAtomId(remainderStart, prior.length);
				remainderCount -= prior.length;
			}
			return updated;
		}
		return id;
	}
}
