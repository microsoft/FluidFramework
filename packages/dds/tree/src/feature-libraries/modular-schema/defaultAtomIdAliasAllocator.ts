/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	offsetChangesetLocalId,
	type ChangesetLocalId,
	type RevisionTag,
} from "../../core/index.js";
import { brand, type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";
import type { AtomIdAliasAllocator } from "./fieldChangeHandler.js";

export class DefaultAtomIdAliasAllocator implements AtomIdAliasAllocator {
	/**
	 * Mapping from original revision tag to the offset that should be applied to local IDs from that revision.
	 */
	private readonly offsets: Map<
		RevisionTag,
		{ readonly offset: number; readonly originalMaxLocalId: ChangesetLocalId }
	> = new Map();

	private readonly allocator: IdAllocator = idAllocatorFromMaxId();

	public reserve(originalRevision: RevisionTag, originalMaxLocalId: ChangesetLocalId): void {
		const current = this.offsets.get(originalRevision);
		if (current === undefined) {
			const offset =
				originalMaxLocalId < 0
					? this.allocator.getMaxId()
					: this.allocator.allocate(originalMaxLocalId + 1);
			this.offsets.set(originalRevision, { offset, originalMaxLocalId });
		} else {
			assert(
				originalMaxLocalId === current.originalMaxLocalId,
				"Inconsistent original max local ID for the same revision",
			);
		}
	}

	public getAlias(
		originalRevision: RevisionTag,
		originalLocalId: ChangesetLocalId,
	): ChangesetLocalId {
		const current = this.offsets.get(originalRevision);
		if (current === undefined) {
			fail("No alias reserved for the given revision");
		}
		assert(
			originalLocalId <= current.originalMaxLocalId,
			"Original local ID exceeds the reserved count for the given revision",
		);
		return offsetChangesetLocalId(originalLocalId, current.offset);
	}

	public getMaxId = (): ChangesetLocalId => {
		return brand(this.allocator.getMaxId());
	};

	public allocate = (count?: number): ChangesetLocalId => {
		return brand(this.allocator.allocate(count));
	};
}
