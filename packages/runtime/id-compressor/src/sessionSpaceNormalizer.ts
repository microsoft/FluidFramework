/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppendOnlySortedMap } from "./appendOnlySortedMap.js";
import { LocalCompressedId } from "./identifiers.js";
import { compareFiniteNumbers, genCountFromLocalId } from "./utilities.js";

/**
 * The `SessionSpaceNormalizer` tracks the form of the IDs created by the local session.
 * More precisely, it acts as a set of all `LocalCompressedId`s created by the local session and allows querying whether a specific
 * ID was produced by the local session. This information can be used to determine whether the nth ID created by the local session
 * was produced as a local ID (negative) or a final ID (positive).
 *
 * The local and final forms of IDs made by a session can be thought of as two equal-length sparse arrays, aligned such
 * that normalizeLocalToFinal(locals[i]) === finals[i] and vice versa.
 * Below is an example to illustrate how various mappings can arise:
 *
 * ```
 *     +- Creation Index
 *    /     +- Locals
 *   /     /    +- Finals
 *  /     /    /
 * ---+-----+----
 * 0  | -1  | 0   -|___ Two IDs are allocated as locals since no cluster exists. A new cluster is created when acked.
 * 1  | -2  | 1   -|
 * 2  |     | 2   -|
 * 3  |     | 3   --|-- Three more IDs are allocated as finals eagerly since a cluster exists with available capacity.
 * 4  |     | 4   -|
 * 5  | -6  | 10  ----- One ID is allocated as a local (it overflows the existing cluster) and a new cluster is created after ack.
 * 6  |     | 11  ----- This ID (and the subsequent few) is allocated eagerly as a final ID into the existing cluster.
 * 7  |     | 12
 * 8  |     | 13
 * 9  |     | 14
 * 10 | -11 |     ----- The cluster is out of room, so a local ID is allocated. It has no corresponding final ID since it has not been acked.
 * ```
 *
 * This class stores the set of local IDs and thus their indices, as local IDs are essentially negative offsets from the first ID.
 * The form (local or final) of a given ID index (for example, the 5th ID made by the local session) can be deduced from this information.
 */
export class SessionSpaceNormalizer {
	// Run-length encoding of IDs that were generated as local IDs. They are stored as a list of tuples (genCount, count)
	// that are sorted on the genCount so that contains checks can use a binary search.
	private readonly localIdRanges = new AppendOnlySortedMap<number, number>(compareFiniteNumbers);

	public get idRanges(): Pick<AppendOnlySortedMap<number, number>, "size" | "entries"> {
		return this.localIdRanges;
	}

	public addLocalRange(baseGenCount: number, count: number): void {
		const last = this.localIdRanges.last();
		if (last !== undefined) {
			const [lastGenCount, lastCount] = last;
			// Check to see if the added run of local IDs is contiguous with the last range added.
			// If it is, simply merge them (this is the common case).
			if (lastGenCount + lastCount === baseGenCount) {
				this.localIdRanges.replaceLast(lastGenCount, lastCount + count);
				return;
			}
		}
		this.localIdRanges.append(baseGenCount, count);
	}

	public contains(query: LocalCompressedId): boolean {
		const genCount = genCountFromLocalId(query);
		const containingBlock = this.localIdRanges.getPairOrNextLower(genCount);
		if (containingBlock !== undefined) {
			const [baseGenCount, count] = containingBlock;
			if (genCount <= baseGenCount + (count - 1)) {
				return true;
			}
		}
		return false;
	}

	public equals(other: SessionSpaceNormalizer): boolean {
		return this.localIdRanges.equals(
			other.localIdRanges,
			(countA, countB) => countA === countB,
		);
	}
}
