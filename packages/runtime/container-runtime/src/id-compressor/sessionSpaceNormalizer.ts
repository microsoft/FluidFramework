/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppendOnlySortedMap } from "./appendOnlySortedMap";
import { LocalCompressedId } from "./identifiers";
import { compareFiniteNumbersReversed } from "./utilities";

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
	private readonly leadingLocals = new AppendOnlySortedMap<LocalCompressedId, number>(
		compareFiniteNumbersReversed,
	);

	public get contents(): Pick<
		AppendOnlySortedMap<LocalCompressedId, number>,
		"size" | "entries"
	> {
		return this.leadingLocals;
	}

	public addLocalRange(baseLocal: LocalCompressedId, count: number): void {
		const last = this.leadingLocals.last();
		if (last !== undefined) {
			const [lastLocal, lastCount] = last;
			if (lastLocal - lastCount === baseLocal) {
				this.leadingLocals.replaceLast(lastLocal, lastCount + count);
				return;
			}
		}
		this.leadingLocals.append(baseLocal, count);
	}

	public contains(query: LocalCompressedId): boolean {
		const containingBlock = this.leadingLocals.getPairOrNextLower(query);
		if (containingBlock !== undefined) {
			const [startingLocal, count] = containingBlock;
			if (query >= startingLocal - (count - 1)) {
				return true;
			}
		}
		return false;
	}

	public equals(other: SessionSpaceNormalizer): boolean {
		if (this.leadingLocals.size !== other.leadingLocals.size) {
			return false;
		}
		for (let i = 0; i < this.leadingLocals.size; i++) {
			const pairThis = this.leadingLocals.getAtIndex(i);
			const pairOther = other.leadingLocals.getAtIndex(i);
			if (
				pairThis === undefined ||
				pairOther === undefined ||
				pairThis[0] !== pairOther[0] ||
				pairThis[1] !== pairOther[1]
			) {
				return false;
			}
		}
		return true;
	}
}
