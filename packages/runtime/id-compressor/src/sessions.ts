/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import { FinalCompressedId, LocalCompressedId, NumericUuid } from "./identifiers.js";
import { SessionId, StableId } from "./types/index.js";
import {
	compareBigints,
	genCountFromLocalId,
	localIdFromGenCount,
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
} from "./utilities.js";

/**
 * A collection of all sessions known to the compressor (i.e. all finalized/acked allocated UUIDs and their corresponding local and final forms).
 * This collection of all sessions comprises a distributed document's IDs.
 */
export class Sessions {
	// A range-queryable store of all sessions. A btree is used as it solves the predecessor problem for any given UUID, allowing
	// us to quickly find the session that may have produced it.
	private readonly uuidSpace = new BTree<NumericUuid, Session>(undefined, compareBigints);
	// A fast lookup table from session ID to the session object, used to avoid accessing the slower btree
	private readonly sessionCache = new Map<SessionId, Session>();

	public constructor(sessions?: [sessionBase: NumericUuid, session: Session][]) {
		if (sessions !== undefined) {
			// bulk load path
			for (const [numeric, session] of sessions) {
				this.sessionCache.set(stableIdFromNumericUuid(numeric) as SessionId, session);
			}
			this.uuidSpace = new BTree(sessions, compareBigints);
			if (
				this.sessionCache.size !== sessions.length ||
				sessions.length !== this.uuidSpace.size
			) {
				throw new Error("Cannot resume existing session.");
			}
		}
	}

	public sessions(): IterableIterator<Session> {
		return this.sessionCache.values();
	}

	public getOrCreate(sessionId: SessionId): Session {
		const existing = this.sessionCache.get(sessionId);
		if (existing !== undefined) {
			return existing;
		}
		const session = new Session(sessionId);
		assert(
			this.uuidSpace.set(session.sessionUuid, session),
			0x760 /* Duplicate session in map. */,
		);
		this.sessionCache.set(sessionId, session);
		return session;
	}

	public get(sessionId: SessionId): Session | undefined {
		return this.sessionCache.get(sessionId);
	}

	public getContainingCluster(
		query: StableId,
	): [cluster: IdCluster, alignedLocal: LocalCompressedId] | undefined {
		const numericStable = numericUuidFromStableId(query);
		const possibleMatch = this.uuidSpace.getPairOrNextLower(numericStable);
		if (possibleMatch === undefined) {
			return undefined;
		}
		const [_, session] = possibleMatch;
		const numericDelta = subtractNumericUuids(numericStable, session.sessionUuid);
		if (numericDelta > Number.MAX_SAFE_INTEGER) {
			return undefined;
		}
		const alignedLocal = localIdFromGenCount(Number(numericDelta) + 1);
		const containingCluster = session.getClusterByLocal(alignedLocal, true);
		if (containingCluster === undefined) {
			return undefined;
		}
		return [containingCluster, alignedLocal];
	}

	public clusterCollides(cluster: IdCluster): boolean {
		const { session: owningSession, baseLocalId, capacity } = cluster;
		const clusterBaseNumeric = offsetNumericUuid(
			owningSession.sessionUuid,
			genCountFromLocalId(baseLocalId) - 1,
		);
		const clusterMaxNumeric = offsetNumericUuid(clusterBaseNumeric, capacity - 1);
		let closestMatch: [NumericUuid, Session] | undefined =
			this.uuidSpace.getPairOrNextLower(clusterMaxNumeric);
		// Find the first session that is not the owner of this new cluster.
		// Once we have that, check to see if its cluster chain overlaps with the new cluster.
		// Consider the following diagram of UUID space:
		// Cluster chain A:  |----------------------|
		// Cluster chain B:       |----------|
		// Cluster chain C:                       |-------|
		// While it is true that when adding a cluster to chain C, we would find
		// the next lower session (which is B) and erroneously determine we do not collide
		// with any other session, but this situation is impossible to get into as B would
		// have detected that it collided with A (or the other way around, depending on ordering).
		while (closestMatch !== undefined && closestMatch[1] === owningSession) {
			closestMatch = this.uuidSpace.nextLowerPair(closestMatch[0]);
		}
		if (closestMatch === undefined) {
			return false;
		}

		const [_, session] = closestMatch;
		assert(session !== owningSession, 0x761 /* Failed to attempt to detect collisions. */);
		const lastCluster = session.getLastCluster();
		if (lastCluster === undefined) {
			// If the closest session is empty (the local session), then it is guaranteed (probabilistically) that there are no
			// non-empty sessions that have a cluster chain that starts prior to the empty session and collides with the cluster
			// we are checking, so we can return false.
			return false;
		}
		const lastAllocatedNumeric = offsetNumericUuid(
			session.sessionUuid,
			genCountFromLocalId(lastAllocatedLocal(lastCluster)) - 1,
		);
		return lastAllocatedNumeric >= clusterBaseNumeric;
	}

	public equals(other: Sessions, includeLocalState: boolean): boolean {
		const checkIsSubset = (sessionsA: Sessions, sessionsB: Sessions): boolean => {
			const first = sessionsA.sessions().next();
			const firstSessionThis = first.done ? undefined : first.value;
			for (const [stableId, session] of sessionsA.sessionCache.entries()) {
				const otherSession = sessionsB.sessionCache.get(stableId);
				if (otherSession === undefined) {
					if (!session.isEmpty() || includeLocalState) {
						return false;
					}
					assert(
						session === firstSessionThis,
						0x762 /* The only non-empty session must be the local session. */,
					);
				} else if (!session.equals(otherSession)) {
					return false;
				}
			}
			return true;
		};
		return checkIsSubset(this, other) && checkIsSubset(other, this);
	}
}

/**
 * The IDs created by a specific session, stored as a cluster chain to allow for fast conversions.
 */
export class Session {
	// All clusters created by this session, in creation order (thus sorted by base final and local ID).
	private readonly clusterChain: IdCluster[] = [];
	// The numeric form of the SessionId
	public readonly sessionUuid: NumericUuid;

	public constructor(sessionId: SessionId | NumericUuid) {
		this.sessionUuid =
			typeof sessionId === "string" ? numericUuidFromStableId(sessionId) : sessionId;
	}

	/**
	 * Adds a new empty cluster to the cluster chain of this session.
	 */
	public addNewCluster(
		baseFinalId: FinalCompressedId,
		capacity: number,
		count: number,
	): IdCluster {
		const lastCluster = this.getLastCluster();
		const newCluster: IdCluster = {
			session: this,
			baseFinalId,
			baseLocalId: (lastCluster === undefined
				? -1
				: lastAllocatedLocal(lastCluster) - 1) as LocalCompressedId,
			capacity,
			count,
		};
		this.clusterChain.push(newCluster);
		return newCluster;
	}

	public isEmpty(): boolean {
		return this.clusterChain.length === 0;
	}

	/**
	 * Returns the last cluster in this session's cluster chain, if any.
	 */
	public getLastCluster(): IdCluster | undefined {
		return this.clusterChain[this.clusterChain.length - 1];
	}

	/**
	 * Converts the local ID from this session to a final ID, if possible.
	 * @param includeAllocated - true if the conversion should succeed even if the local ID aligns with a part of the cluster that is allocated but not finalized.
	 */
	public tryConvertToFinal(
		searchLocal: LocalCompressedId,
		includeAllocated: boolean,
	): FinalCompressedId | undefined {
		const containingCluster = this.getClusterByLocal(searchLocal, includeAllocated);
		if (containingCluster === undefined) {
			return undefined;
		}
		return getAlignedFinal(containingCluster, searchLocal);
	}

	/**
	 * Returns the cluster containing the supplied local ID, if possible.
	 * @param includeAllocated - true if the conversion should succeed even if the local ID aligns with a part of the cluster that is allocated but not finalized.
	 */
	public getClusterByLocal(
		localId: LocalCompressedId,
		includeAllocated: boolean,
	): IdCluster | undefined {
		const lastValidLocal: (cluster: IdCluster) => LocalCompressedId = includeAllocated
			? lastAllocatedLocal
			: lastFinalizedLocal;
		const matchedCluster = Session.binarySearch(
			localId,
			this.clusterChain,
			(local, cluster): number => {
				const lastLocal = lastValidLocal(cluster);
				if (local < lastLocal) {
					return 1;
				} else if (local > cluster.baseLocalId) {
					return -1;
				} else {
					return 0;
				}
			},
		);
		return matchedCluster;
	}

	/**
	 * Returns the cluster containing the supplied final ID, if possible.
	 */
	public getClusterByAllocatedFinal(final: FinalCompressedId): IdCluster | undefined {
		return Session.getContainingCluster(final, this.clusterChain);
	}

	/**
	 * Returns the cluster from the supplied cluster chain containing the supplied final ID, if possible.
	 * `clusterChain` must be sorted by final/local base ID.
	 */
	public static getContainingCluster(
		finalId: FinalCompressedId,
		clusterChain: readonly IdCluster[],
	): IdCluster | undefined {
		return Session.binarySearch(finalId, clusterChain, (final, cluster) => {
			const lastFinal = lastAllocatedFinal(cluster);
			if (final < cluster.baseFinalId) {
				return -1;
			} else if (final > lastFinal) {
				return 1;
			} else {
				return 0;
			}
		});
	}

	static binarySearch<S, T>(
		search: S,
		arr: readonly T[],
		comparator: (a: S, b: T) => number,
	): T | undefined {
		let left = 0;
		let right = arr.length - 1;
		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const value = arr[mid];
			assert(value !== undefined, 0x9dc /* value is undefined in Session.binarySearch */);
			const c = comparator(search, value);
			if (c === 0) {
				return value; // Found the target, return its index.
			} else if (c > 0) {
				left = mid + 1; // Continue search on right half.
			} else {
				right = mid - 1; // Continue search on left half.
			}
		}
		return undefined; // If we reach here, target is not in array.
	}

	public equals(other: Session): boolean {
		for (const [index, value] of Object.entries(this.clusterChain)) {
			if (!clustersEqual(value, other.clusterChain[index] as IdCluster)) {
				return false;
			}
		}

		return this.sessionUuid === other.sessionUuid;
	}
}

/**
 * A cluster of final (sequenced via consensus), sequentially allocated compressed IDs.
 * A final ID in a cluster decompresses to a sequentially allocated UUID that is the result of adding its offset within
 * the cluster to base UUID for the session that created it.
 */
export interface IdCluster {
	/**
	 * The session that created this cluster.
	 */
	readonly session: Session;

	/**
	 * The first final ID in the cluster.
	 */
	readonly baseFinalId: FinalCompressedId;

	/**
	 * The local ID aligned with `baseFinalId`.
	 */
	readonly baseLocalId: LocalCompressedId;

	/**
	 * The total number of final IDs reserved for allocation in the cluster.
	 * Clusters are reserved in blocks as a performance optimization.
	 */
	capacity: number;

	/**
	 * The number of final IDs currently allocated in the cluster.
	 */
	count: number;
}

export function clustersEqual(a: IdCluster, b: IdCluster): boolean {
	return (
		a.session.sessionUuid === b.session.sessionUuid &&
		a.baseFinalId === b.baseFinalId &&
		a.baseLocalId === b.baseLocalId &&
		a.capacity === b.capacity &&
		a.count === b.count
	);
}

/**
 * Returns the final ID that is aligned with the supplied local ID within a cluster.
 * Includes allocated IDs.
 */
export function getAlignedFinal(
	cluster: IdCluster,
	localWithin: LocalCompressedId,
): FinalCompressedId | undefined {
	const clusterOffset =
		genCountFromLocalId(localWithin) - genCountFromLocalId(cluster.baseLocalId);
	if (clusterOffset < cluster.capacity) {
		return ((cluster.baseFinalId as number) + clusterOffset) as FinalCompressedId;
	}
	return undefined;
}

/**
 * Returns the local ID that is aligned with the supplied final ID within a cluster.
 * Fails if the supplied ID does not fall within the cluster bounds.
 */
export function getAlignedLocal(
	cluster: IdCluster,
	finalWithin: FinalCompressedId,
): LocalCompressedId {
	assert(
		finalWithin >= cluster.baseFinalId && finalWithin <= lastAllocatedFinal(cluster),
		0x763 /* Supplied ID is not within the cluster. */,
	);
	const finalDelta = finalWithin - cluster.baseFinalId;
	return (cluster.baseLocalId - finalDelta) as LocalCompressedId;
}

/**
 * Returns the last allocated final ID (i.e. any ID between base final and base final + capacity) within a cluster
 */
export function lastAllocatedFinal(cluster: IdCluster): FinalCompressedId {
	return ((cluster.baseFinalId as number) + (cluster.capacity - 1)) as FinalCompressedId;
}

/**
 * Returns the last allocated final ID (i.e. any ID between base final and base final + count) within a cluster
 */
export function lastFinalizedFinal(cluster: IdCluster): FinalCompressedId {
	return ((cluster.baseFinalId as number) + (cluster.count - 1)) as FinalCompressedId;
}

/**
 * Returns the last allocated local ID (i.e. any ID between base local and base local + capacity) within a cluster
 */
export function lastAllocatedLocal(cluster: IdCluster): LocalCompressedId {
	return ((cluster.baseLocalId as number) - (cluster.capacity - 1)) as LocalCompressedId;
}

/**
 * Returns the last allocated local ID (i.e. any ID between base local and base local + count) within a cluster
 */
export function lastFinalizedLocal(cluster: IdCluster): LocalCompressedId {
	return ((cluster.baseLocalId as number) - (cluster.count - 1)) as LocalCompressedId;
}
