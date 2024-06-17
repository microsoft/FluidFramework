/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';

import { Mutable, compareFiniteNumbers, compareFiniteNumbersReversed, fail } from '../Common.js';
import { FinalCompressedId, LocalCompressedId, SessionSpaceCompressedId } from '../Identifiers.js';

import { AppendOnlyDoublySortedMap } from './AppendOnlySortedMap.js';
import { SerializedSessionIdNormalizer } from './persisted-types/index.js';

/**
 * Maps IDs created by a session between their local and final forms (i.e. normalization). These IDs are in a contiguous range.
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
 * 6  |     | 11  ----- One ID is allocated as a final eagerly into the existing cluster.
 * 7  | -8  | 12  ----- A local ID with an override is allocated. The override forces it to be a local ID.
 * 8  |     | 13
 * 9  |     | 14
 * 10 | -11 |     ----- A local ID is allocated. It has no corresponding final ID since it has not been acked.
 * ```
 *
 * Note that in this example, some IDs (those at indices 2, 3, 4, 6, 8, and 9) have no local form. The ID at index 10 has no final form.
 * These kinds of "gaps" occur due to the timing of allocation calls on the client and how they relate to finalization/cluster creation,
 * which depends on receiving an ack/sequence number from the server. Given this context, "session space" can be thought of as:
 *
 * ```
 * for each index in the range of IDs created by a session:
 * 	the local form if it exists, otherwise the final form
 * ```
 *
 * This class is designed to efficiently build and query these mappings by leveraging the facts that much of the range (in both local and
 * final space) is uninterrupted by "gaps" and can be compactly represented by a (first, last) pair and is easily binary searched for
 * normalization between local and final space.
 */
export class SessionIdNormalizer<TRangeObject> {
	private nextLocalId: LocalCompressedId = -1 as LocalCompressedId;
	private readonly idRanges: AppendOnlyDoublySortedMap<
		LocalCompressedId,
		[lastLocal: LocalCompressedId, finalRanges: FinalRanges<TRangeObject> | undefined],
		FinalCompressedId
	> = new AppendOnlyDoublySortedMap(
		compareFiniteNumbersReversed,
		([_, finalRanges]) => {
			if (finalRanges !== undefined) {
				const first = getFirstRange(finalRanges);
				return extractFirstFinalFromRange(first);
			}
			return Number.POSITIVE_INFINITY as FinalCompressedId;
		},
		compareFiniteNumbers
	);

	public constructor(private readonly expensiveAsserts = false) {}

	/**
	 * Converts the final ID to its session-space representation.
	 * This will be the corresponding local if a local form exists, and `finalId` otherwise.
	 */
	public getSessionSpaceId(finalId: FinalCompressedId): SessionSpaceCompressedId | undefined {
		const localRange = this.idRanges.getPairOrNextLowerByValue(finalId);
		if (localRange !== undefined) {
			const [firstLocal, [lastLocal, finalRanges]] = localRange;
			const finalRange = getPairOrNextLowerByValue(firstLocal, finalRanges, finalId);
			if (finalRange !== undefined) {
				const [alignedLocal, [firstFinal, lastFinal]] = finalRange;
				if (finalId <= lastFinal) {
					const localRangeDelta = alignedLocal - lastLocal;
					const finalDelta = finalId - firstFinal;
					if (finalDelta <= localRangeDelta) {
						return (alignedLocal - finalDelta) as LocalCompressedId;
					}
					// `finalId` was an eagerly generated final ID
					return finalId as SessionSpaceCompressedId;
				}
			}
		}
		return undefined;
	}

	/**
	 * Converts the local ID to its corresponding final ID, if one exists.
	 */
	public getFinalId(localId: LocalCompressedId): [FinalCompressedId, TRangeObject] | undefined {
		const localRange =
			this.idRanges.getPairOrNextLower(localId) ?? fail('Local ID was never recorded with this normalizer.');
		const [firstLocal, [lastLocal, finalRanges]] = localRange;
		if (localId < lastLocal) {
			fail('Local ID was never recorded with this normalizer.');
		}
		const finalRange = getPairOrNextLower(firstLocal, finalRanges, localId);
		if (finalRange !== undefined) {
			const [alignedLocal, [firstFinal, lastFinal, rangeObject]] = finalRange;
			const rangeDelta = lastFinal - firstFinal;
			const localDelta = alignedLocal - localId;
			if (localDelta <= rangeDelta) {
				// Local is within a range segment that has a corresponding final
				return [(firstFinal + localDelta) as FinalCompressedId, rangeObject];
			}
		}
		return undefined;
	}

	/**
	 * Returns the index of the local ID corresponding to the supplied final ID in the total range of IDs created by the session,
	 * if the ID was created by the session for this `SessionIdNormalizer`.
	 */
	public getCreationIndex(finalId: FinalCompressedId): number | undefined {
		const localRange = this.idRanges.getPairOrNextLowerByValue(finalId);
		if (localRange !== undefined) {
			const [firstLocal, [_, finalRanges]] = localRange;
			const finalRange = getPairOrNextLowerByValue(firstLocal, finalRanges, finalId);
			if (finalRange !== undefined) {
				const [alignedLocal, [firstFinal, lastFinal]] = finalRange;
				if (finalId <= lastFinal) {
					const finalDelta = finalId - firstFinal;
					return -alignedLocal - 1 + finalDelta;
				}
			}
		}
		return undefined;
	}

	/**
	 * Returns the session-space ID at the supplied creation index, if one exists.
	 */
	public getIdByCreationIndex(index: number): SessionSpaceCompressedId | undefined {
		const localByIndex = -(index + 1) as LocalCompressedId;
		const localRange = this.idRanges.getPairOrNextLower(localByIndex);
		if (localRange === undefined) {
			return undefined;
		}
		const [firstLocal, [lastLocal, finalRanges]] = localRange;
		if (localByIndex >= lastLocal) {
			return localByIndex;
		}
		const finalRange =
			getPairOrNextLower(firstLocal, finalRanges, localByIndex) ??
			fail('Final ranges not aligned with owning local range.');

		const [alignedLocal, [firstFinal, lastFinal]] = finalRange;
		const localDelta = alignedLocal - localByIndex;
		const finalId = firstFinal + localDelta;
		if (finalId <= lastFinal) {
			// `finalId` was an eagerly generated final ID
			return finalId as SessionSpaceCompressedId;
		}
		return undefined;
	}

	private static makeFinalRangesMap<TRangeObject>(): FinalRangesMap<TRangeObject> {
		return new AppendOnlyDoublySortedMap(
			compareFiniteNumbersReversed,
			extractFirstFinalFromRange,
			compareFiniteNumbers
		);
	}

	/**
	 * Returns the last final ID known to this normalizer.
	 */
	public getLastFinalId(): FinalCompressedId | undefined {
		const lastIndex = this.idRanges.size - 1;
		const secondToLast = Math.max(0, lastIndex - 1);
		for (let i = lastIndex; i >= secondToLast; i--) {
			const localRange = this.idRanges.getAtIndex(i);
			if (localRange !== undefined) {
				const finalRanges = localRange[1][1];
				if (finalRanges !== undefined) {
					return getLastRange(finalRanges)[1];
				}
			}
		}
		return undefined;
	}

	/**
	 * Registers and returns the next ID in local space with this normalizer. An example:
	 *
	 * Locals: [-1, -2,  X,  X]
	 * Finals: [ 0,  1,  2,  3]
	 * In this scenario, a call to this method would generate and return -5.
	 */
	public addLocalId(): LocalCompressedId {
		const localId = this.nextLocalId-- as LocalCompressedId;
		const lastLocalRange = this.idRanges.last();
		if (lastLocalRange !== undefined) {
			const lastLocal = lastLocalRange[1][0];
			if (localId === lastLocal - 1) {
				// New local simply expands the last local range tracked
				lastLocalRange[1][0] = localId;
				return localId;
			}
		}

		if (this.expensiveAsserts) {
			if (lastLocalRange === undefined) {
				assert(localId === -1, 0x657 /* Local ID space must start at -1. */);
			} else {
				const [firstLocal, [_, finalRanges]] = lastLocalRange;
				let finalDelta = 0;
				for (const [_, [firstFinal, lastFinal]] of entries(firstLocal, finalRanges)) {
					finalDelta += lastFinal - firstFinal + 1;
				}
				assert(localId === firstLocal - finalDelta, 0x658 /* Local ID space must be contiguous. */);
			}
		}

		this.idRanges.append(localId, [localId, undefined]);
		return localId;
	}

	/**
	 * Registers one or more final IDs with this normalizer.
	 * If there are any local IDs at the tip of session-space that do not have a corresponding final, they will be registered (aligned)
	 * starting with the first of those. Otherwise, will be registered as the next ID in session space in creation order.
	 *
	 * An example:
	 * Locals: [-1, -2,  X,  -4]
	 * Finals: [ 0,  1,  2,   X]
	 * Calling `addFinalIds` with first === last === 5 results in the following:
	 * Locals: [-1, -2,  X,  -4]
	 * Finals: [ 0,  1,  2,   5]
	 * Subsequently calling `addFinalIds` with first === last === 6 results in the following:
	 * Locals: [-1, -2,  X,  -4,  X]
	 * Finals: [ 0,  1,  2,   5,  6]
	 *
	 * Non-contiguous final IDs (i.e. the first final after a "gap" in final space) must always correspond to a local ID. For example,
	 * in the final call to `addFinalIds` above would fail if first === last === 9, because the resulting state would have a
	 * non-contiguous final ID without a local form:
	 * Locals: [-1, -2,  X,  -4,  X]
	 * Finals: [ 0,  1,  2,   5,  9]
	 *
	 * ^final ID 9 is not contiguous and does not have a corresponding local ID
	 */
	public addFinalIds(firstFinal: FinalCompressedId, lastFinal: FinalCompressedId, rangeObject: TRangeObject): void {
		assert(lastFinal >= firstFinal, 0x659 /* Malformed normalization range. */);
		const [firstLocal, finalRangesObj] =
			this.idRanges.last() ?? fail('Final IDs must be added to an existing local range.');
		const [lastLocal, finalRanges] = finalRangesObj;
		let nextLocal: LocalCompressedId;
		if (finalRanges === undefined) {
			finalRangesObj[1] = [firstFinal, lastFinal, rangeObject];
			nextLocal = Math.min(this.nextLocalId, firstLocal - (lastFinal - firstFinal) - 1) as LocalCompressedId;
		} else {
			const [firstAlignedLocal, lastAlignedLocal, lastAlignedFinal, lastFinalRange] = this.getAlignmentOfLastRange(
				firstLocal,
				finalRanges
			);
			nextLocal = Math.min(this.nextLocalId, lastAlignedLocal - (lastFinal - firstFinal) - 2) as LocalCompressedId;
			if (firstFinal === lastAlignedFinal + 1) {
				lastFinalRange[1] = lastFinal;
			} else {
				const alignedLocal = (lastAlignedLocal - 1) as LocalCompressedId;
				let rangeMap: FinalRangesMap<TRangeObject>;
				if (isSingleRange(finalRanges)) {
					// Convert the single range to a range collection
					rangeMap = SessionIdNormalizer.makeFinalRangesMap();
					rangeMap.append(firstAlignedLocal, lastFinalRange);
					finalRangesObj[1] = rangeMap;
				} else {
					rangeMap = finalRanges;
				}
				rangeMap.append(alignedLocal, [firstFinal, lastFinal, rangeObject]);
				assert(alignedLocal >= lastLocal, 0x65a /* Gaps in final space must align to a local. */);
			}
			if (this.expensiveAsserts) {
				this.idRanges.assertValid();
			}
		}

		this.nextLocalId = nextLocal;
	}

	/**
	 * Alerts the normalizer to the existence of a block of final IDs that are *allocated* (but may not be entirely used).
	 *
	 * The normalizer may have unaligned (unfinalized) local IDs; any such outstanding locals will be eagerly aligned with
	 * as many finals from the registered block as possible.
	 *
	 * It is important to register blocks via this method as soon as they are created for future eager final generations to be utilized, as such
	 * generation is dependant on the normalizer being up-to-date with which local IDs have been aligned with finals. If, for instance,
	 * a block of finals is not immediately registered with the normalizer and there are outstanding locals that would have aligned with them,
	 * those locals will not be finalized until their creation range is finalized, which could be later if the block was created by an earlier
	 * creation range's finalization but is large enough to span them both. In this scenario, no eager finals can be generated until the second
	 * creation range is finalized.
	 *
	 * A usage example:
	 * Locals: [-1, -2,  X,  -4, -5, -6]
	 * Finals: [ 0,  1,  2,   X,  X,  X]
	 * Calling `registerFinalIdBlock` with firstFinalInBlock === 5 and count === 10 results in the following:
	 * Locals: [-1, -2,  X,  -4, -5, -6]
	 * Finals: [ 0,  1,  2,   5,  6,  7]
	 * Instead calling `registerFinalIdBlock` with firstFinalInBlock === 5 and count === 2 results in the following:
	 * Locals: [-1, -2,  X,  -4, -5, -6]
	 * Finals: [ 0,  1,  2,   5,  6,  X]
	 *
	 */
	public registerFinalIdBlock(firstFinalInBlock: FinalCompressedId, count: number, rangeObject: TRangeObject): void {
		assert(count >= 1, 0x65b /* Malformed normalization block. */);
		const [firstLocal, [lastLocal, finalRanges]] =
			this.idRanges.last() ?? fail('Final ID block should not be registered before any locals.');
		let unalignedLocalCount: number;
		if (finalRanges === undefined) {
			unalignedLocalCount = firstLocal - lastLocal + 1;
		} else {
			const [_, lastAlignedLocal] = this.getAlignmentOfLastRange(firstLocal, finalRanges);
			unalignedLocalCount = lastAlignedLocal - lastLocal;
		}
		assert(
			unalignedLocalCount > 0,
			0x65c /* Final ID block should not be registered without an existing local range. */
		);
		const lastFinal = (firstFinalInBlock + Math.min(unalignedLocalCount, count) - 1) as FinalCompressedId;
		this.addFinalIds(firstFinalInBlock, lastFinal, rangeObject);
	}

	private getAlignmentOfLastRange(
		firstLocal: LocalCompressedId,
		finalRanges: FinalRanges<TRangeObject>
	): [
		firstAlignedLocal: LocalCompressedId,
		lastAlignedLocal: LocalCompressedId,
		lastAlignedFinal: FinalCompressedId,
		lastFinalRange: FinalRange<TRangeObject>,
	] {
		const isSingle = isSingleRange(finalRanges);
		let lastFinalRange: FinalRange<TRangeObject>;
		let firstAlignedLocal: LocalCompressedId;
		if (isSingle) {
			firstAlignedLocal = firstLocal;
			lastFinalRange = finalRanges;
		} else {
			[firstAlignedLocal, lastFinalRange] = finalRanges.last() ?? fail('Map should be non-empty.');
		}

		const [firstAlignedFinal, lastAlignedFinal] = lastFinalRange;
		const lastAlignedLocal = firstAlignedLocal - (lastAlignedFinal - firstAlignedFinal);
		return [firstAlignedLocal, lastAlignedLocal as LocalCompressedId, lastAlignedFinal, lastFinalRange];
	}

	/**
	 * Returns an enumerable of all session-space IDs known to this normalizer, in creation order.
	 */
	public *[Symbol.iterator](): IterableIterator<SessionSpaceCompressedId> {
		for (const [firstLocal, [lastLocal, finalRanges]] of this.idRanges.entries()) {
			for (let i = firstLocal; i >= lastLocal; i--) {
				yield i;
			}
			if (finalRanges !== undefined) {
				// Safe to get only the last final range, as all others must have corresponding locals (see `addFinalIds` docs)
				let lastFinalRange: FinalRange<TRangeObject>;
				let alignedLocal: LocalCompressedId;
				if (isSingleRange(finalRanges)) {
					alignedLocal = firstLocal;
					lastFinalRange = finalRanges;
				} else {
					[alignedLocal, lastFinalRange] = finalRanges.last() ?? fail('Map should be non-empty.');
				}
				const [firstFinal, lastFinal] = lastFinalRange;
				const localRangeDelta = alignedLocal - lastLocal;
				for (let i = firstFinal + localRangeDelta + 1; i <= lastFinal; i++) {
					yield i as SessionSpaceCompressedId;
				}
			}
		}
	}

	public serialize(): SerializedSessionIdNormalizer {
		const serialized: Mutable<SerializedSessionIdNormalizer> = {
			localRanges: [],
			nextLocalId: this.nextLocalId,
		};
		const localRanges = serialized.localRanges as Mutable<typeof serialized.localRanges>;
		for (const [firstLocal, finalRanges] of this.idRanges.entries()) {
			const [lastLocal, finalRangesTable] = finalRanges;
			if (finalRangesTable !== undefined) {
				const serializedFinalRanges: [LocalCompressedId, FinalCompressedId, FinalCompressedId][] = [];
				for (const [alignedLocal, [firstFinal, lastFinal]] of entries(firstLocal, finalRangesTable)) {
					serializedFinalRanges.push([alignedLocal, firstFinal, lastFinal]);
				}
				localRanges.push([firstLocal, lastLocal, serializedFinalRanges]);
			} else {
				localRanges.push([firstLocal, lastLocal]);
			}
		}
		return serialized;
	}

	public static deserialize<TRangeObject>(
		serialized: SerializedSessionIdNormalizer,
		getRangeObject: (finalId: FinalCompressedId) => TRangeObject
	): SessionIdNormalizer<TRangeObject> {
		const normalizer = new SessionIdNormalizer<TRangeObject>();
		const { idRanges } = normalizer;
		for (const [firstLocal, lastLocal, serializedFinalRanges] of serialized.localRanges) {
			let finalRanges: FinalRanges<TRangeObject> | undefined;
			if (serializedFinalRanges !== undefined) {
				assert(serializedFinalRanges.length !== 0, 0x65d /* Empty range should not be reified. */);
				if (serializedFinalRanges.length === 1) {
					const [_, firstFinal, lastFinal] = serializedFinalRanges[0];
					finalRanges = [firstFinal, lastFinal, getRangeObject(firstFinal)];
				} else {
					finalRanges = SessionIdNormalizer.makeFinalRangesMap<TRangeObject>();
					for (const [alignedLocal, firstFinal, lastFinal] of serializedFinalRanges) {
						finalRanges.append(alignedLocal, [firstFinal, lastFinal, getRangeObject(firstFinal)]);
					}
				}
			}
			idRanges.append(firstLocal, [lastLocal, finalRanges]);
		}
		normalizer.nextLocalId = serialized.nextLocalId;
		return normalizer;
	}

	public equals(
		other: SessionIdNormalizer<TRangeObject>,
		compareRangeObjects: (a: TRangeObject, b: TRangeObject) => boolean = (a, b) => a === b
	): boolean {
		return (
			this.nextLocalId === other.nextLocalId &&
			this.idRanges.equals(other.idRanges, (localRangeA, localRangeB) => {
				const [lastLocalA, finalRangesA] = localRangeA;
				const [lastLocalB, finalRangesB] = localRangeB;
				if (finalRangesA === undefined || finalRangesB === undefined) {
					return finalRangesA === finalRangesB;
				}

				const rangeEquals = (finalRangeA: FinalRange<TRangeObject>, finalRangeB: FinalRange<TRangeObject>) => {
					const [firstFinalA, lastFinalA, rangeObjectA] = finalRangeA;
					const [firstFinalB, lastFinalB, rangeObjectB] = finalRangeB;
					return (
						firstFinalA === firstFinalB && lastFinalA === lastFinalB && compareRangeObjects(rangeObjectA, rangeObjectB)
					);
				};

				if (isSingleRange(finalRangesA) || isSingleRange(finalRangesB)) {
					if (!isSingleRange(finalRangesA) || !isSingleRange(finalRangesB)) {
						return false;
					}
					return rangeEquals(finalRangesA, finalRangesB);
				}

				return lastLocalA === lastLocalB && finalRangesA.equals(finalRangesB, rangeEquals);
			})
		);
	}
}

type FinalRange<TRangeObject> = [
	firstFinal: FinalCompressedId,
	lastFinal: FinalCompressedId,
	rangeObject: TRangeObject,
];

type FinalRangesMap<TRangeObject> = AppendOnlyDoublySortedMap<
	LocalCompressedId,
	FinalRange<TRangeObject>,
	FinalCompressedId
>;

type FinalRanges<TRangeObject> = FinalRange<TRangeObject> | FinalRangesMap<TRangeObject>;

function isSingleRange<TRangeObject>(ranges: FinalRanges<TRangeObject>): ranges is FinalRange<TRangeObject> {
	return Array.isArray(ranges);
}

function getLastRange<TRangeObject>(finalRanges: FinalRanges<TRangeObject>): FinalRange<TRangeObject> {
	if (isSingleRange(finalRanges)) {
		return finalRanges;
	}
	return (finalRanges.last() ?? fail('Map must be non-empty'))[1];
}

function getFirstRange<TRangeObject>(finalRanges: FinalRanges<TRangeObject>): FinalRange<TRangeObject> {
	if (isSingleRange(finalRanges)) {
		return finalRanges;
	}
	return (finalRanges.first() ?? fail('Map must be non-empty'))[1];
}

function extractFirstFinalFromRange<TRangeObject>(finalRange: FinalRange<TRangeObject>): FinalCompressedId {
	return finalRange[0];
}

function getPairOrNextLowerByValue<TRangeObject>(
	firstLocal: LocalCompressedId,
	finalRanges: FinalRanges<TRangeObject> | undefined,
	finalId: FinalCompressedId
): readonly [LocalCompressedId, FinalRange<TRangeObject>] | undefined {
	if (finalRanges === undefined) {
		return undefined;
	}
	if (isSingleRange(finalRanges)) {
		if (finalId < finalRanges[0]) {
			return undefined;
		}
		return [firstLocal, finalRanges];
	}
	return finalRanges.getPairOrNextLowerByValue(finalId);
}

function getPairOrNextLower<TRangeObject>(
	firstLocal: LocalCompressedId,
	finalRanges: FinalRanges<TRangeObject> | undefined,
	localId: LocalCompressedId
): readonly [LocalCompressedId, FinalRange<TRangeObject>] | undefined {
	if (finalRanges === undefined) {
		return undefined;
	}
	if (isSingleRange(finalRanges)) {
		if (localId > firstLocal) {
			return undefined;
		}
		return [firstLocal, finalRanges];
	}
	return finalRanges.getPairOrNextLower(localId);
}

function* entries<TRangeObject>(
	firstLocal: LocalCompressedId,
	finalRanges: FinalRanges<TRangeObject> | undefined
): IterableIterator<readonly [LocalCompressedId, FinalRange<TRangeObject>]> {
	if (finalRanges !== undefined) {
		if (isSingleRange(finalRanges)) {
			yield [firstLocal, finalRanges];
		} else {
			for (const range of finalRanges.entries()) {
				yield range;
			}
		}
	}
}
