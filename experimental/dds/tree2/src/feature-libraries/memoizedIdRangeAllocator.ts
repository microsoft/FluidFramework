/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetLocalId, RevisionTag } from "../core";
import {
	RangeMap,
	getOrAddEmptyToMap,
	getFirstFromRangeMap,
	setInRangeMap,
	Mutable,
	brand,
	generateStableId,
} from "../util";

/**
 * A unique ID allocator that returns the output ID for the same input ID.
 *
 * @alpha
 */
export interface MemoizedIdRangeAllocator {
	/**
	 * The next ID to allocate.
	 */
	nextId: number;
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
	 * Allocates a new range of IDs starting from the nextId.
	 *
	 * @param count - The number of IDs to allocate. Interpreted as 1 if undefined.
	 */
	mint(count?: number): IdRange[];
}

/**
 * @alpha
 */
export interface IdRange {
	readonly first: ChangesetLocalId;
	readonly count: number;
}

/**
 * @alpha
 */
export const MemoizedIdRangeAllocator = {
	fromNextId(nextId: number = 0): MemoizedIdRangeAllocator {
		const rangeMap: Map<RevisionTag | undefined, RangeMap<number>> = new Map();
		return {
			nextId,
			allocate(
				key: string | number | undefined,
				startId: number,
				length?: number,
			): IdRange[] {
				let count = length ?? 1;
				const out: IdRange[] = [];
				const ranges = getOrAddEmptyToMap(rangeMap, key);
				let currId = startId;
				while (count > 0) {
					const firstRange = getFirstFromRangeMap(ranges, currId, count);
					if (firstRange === undefined) {
						const newId = this.nextId;
						this.nextId += count;
						setInRangeMap(ranges, currId, count, newId);
						out.push({ first: brand(newId), count });
						count = 0;
					} else {
						const idRange: Mutable<IdRange> = {
							first: brand(firstRange.value),
							count: firstRange.length,
						};
						if (currId < firstRange.start) {
							const countToAdd = firstRange.start - currId;
							setInRangeMap(ranges, currId, countToAdd, this.nextId);
							out.push({ first: brand(this.nextId), count: countToAdd });
							this.nextId += countToAdd;
							currId += countToAdd;
							count -= countToAdd;
						} else if (firstRange.start < currId) {
							const countToTrim = currId - firstRange.start;
							idRange.first = brand((idRange.first as number) + countToTrim);
							idRange.count -= countToTrim;
						}
						if (idRange.count > count) {
							idRange.count = count;
						} else if (
							idRange.count < count &&
							firstRange.value + firstRange.length === this.nextId
						) {
							// The existing range can be extended
							this.nextId += count - idRange.count;
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
			mint(length?: number): IdRange[] {
				let count = length ?? 1;
				const out: IdRange[] = [];
				const ranges = getOrAddEmptyToMap(rangeMap, generateStableId());
				const currId = this.nextId;
				while (count > 0) {
					const newId = this.nextId;
					this.nextId += count;
					setInRangeMap(ranges, currId, count, newId);
					out.push({ first: brand(newId), count });
					count = 0;
				}
				return out;
			},
		};
	},
};
