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
} from "../util";

/**
 * An unique ID allocator that returns the output ID for the same input ID.
 * "The same" here includes cases where a prior call allocated a range of IDs that partially or fully overlap with the
 * current call.
 * @alpha
 *
 * @param revision - The revision associated with the range of IDs to allocate.
 * @param startId - The first ID to allocate.
 * @param count - The number of IDs to allocate. Interpreted as 1 if undefined.
 */
export type MemoizedIdRangeAllocator = (
	revision: RevisionTag | undefined,
	startId: ChangesetLocalId,
	count?: number,
) => IdRange[];

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
		let _nextId = nextId;
		const rangeMap: Map<RevisionTag | undefined, RangeMap<number>> = new Map();
		return (key: string | number | undefined, startId: number, length?: number): IdRange[] => {
			let count = length ?? 1;
			const out: IdRange[] = [];
			const ranges = getOrAddEmptyToMap(rangeMap, key);
			let currId = startId;
			while (count > 0) {
				const firstRange = getFirstFromRangeMap(ranges, currId, count);
				if (firstRange === undefined) {
					const newId = _nextId;
					_nextId += count;
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
						setInRangeMap(ranges, currId, countToAdd, _nextId);
						out.push({ first: brand(_nextId), count: countToAdd });
						_nextId += countToAdd;
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
						firstRange.value + firstRange.length === _nextId
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
		};
	},
};
