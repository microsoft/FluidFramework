/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { ChangesetLocalId, RevisionTag } from "../core/index.js";
import { type Mutable, RangeMap, brand } from "../util/index.js";

/**
 * A unique ID allocator that returns the output ID for the same input ID.
 */
export interface MemoizedIdRangeAllocator {
	/**
	 * A unique ID allocator that returns the output ID for the same input ID.
	 *
	 * "The same" here includes cases where a prior call allocated a range of IDs that partially or fully overlap with the
	 * current call.
	 * @param revision - The revision associated with the range of IDs to allocate.
	 * @param startId - The first ID to allocate.
	 * @param count - The number of IDs to allocate. Interpreted as 1 if undefined.
	 */
	allocate(
		revision: RevisionTag | undefined,
		startId: ChangesetLocalId,
		count?: number,
	): IdRange[];
	/**
	 * Allocates a new range of IDs.
	 *
	 * @param count - The number of IDs to allocate. Interpreted as 1 if undefined.
	 */
	mint(count?: number): ChangesetLocalId;
}

/**
 */
export interface IdRange {
	readonly first: ChangesetLocalId;
	readonly count: number;
}

/**
 */
export const MemoizedIdRangeAllocator = {
	fromNextId(nextId: number = 0): MemoizedIdRangeAllocator {
		const rangeMap: Map<RevisionTag | undefined, RangeMap<number>> = new Map();
		let _nextId = nextId;
		return {
			allocate(key: string | number | undefined, startId: number, length?: number): IdRange[] {
				let count = length ?? 1;
				const out: IdRange[] = [];
				let ranges = rangeMap.get(key as RevisionTag);
				if (ranges === undefined) {
					ranges = new RangeMap<number>();
					rangeMap.set(key as RevisionTag, ranges);
				}
				let currId = startId;
				while (count > 0) {
					const firstRange = ranges.getFirstEntryFromRange(currId, count);
					if (firstRange === undefined) {
						const newId = _nextId;
						_nextId += count;
						ranges.setInRange(currId, count, newId);
						out.push({ first: brand(newId), count });
						count = 0;
					} else {
						const idRange: Mutable<IdRange> = {
							first: brand(firstRange.value!),
							count: firstRange.length,
						};
						if (currId < firstRange.start!) {
							const countToAdd = firstRange.start! - currId;
							ranges.setInRange(currId, countToAdd, _nextId);
							out.push({ first: brand(_nextId), count: countToAdd });
							_nextId += countToAdd;
							currId += countToAdd;
							count -= countToAdd;
						} else if (firstRange.start! < currId) {
							const countToTrim = currId - firstRange.start!;
							idRange.first = brand((idRange.first as number) + countToTrim);
							idRange.count -= countToTrim;
						}
						if (idRange.count > count) {
							idRange.count = count;
						} else if (
							idRange.count < count &&
							firstRange.value! + firstRange.length === _nextId
						) {
							// The existing range can be extended
							_nextId += count - idRange.count;
							firstRange.length = count;
							idRange.count = count;
						}
						out.push(idRange);
						count -= idRange.count;
						currId += idRange.count;
					}
				}
				return out;
			},
			mint(length?: number): ChangesetLocalId {
				const count = length ?? 1;
				const out = _nextId;
				_nextId += count;
				return brand(out);
			},
		};
	},
};
