/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from "sorted-btree";
import { SessionId, StableId } from "@fluidframework/runtime-definitions";
import { assert } from "@fluidframework/common-utils";
import {
	binarySearch,
	compareBigints,
	localIdFromGenCount,
	genCountFromLocalId,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
	subtractNumericUuids,
	offsetNumericUuid,
} from "./utilities";
import { FinalCompressedId, LocalCompressedId, NumericUuid } from "./identifiers";

/**
 * The local/UUID space within an individual session.
 * Contains a collection of all sessions that make up a distributed document's IDs.
 */
export class Sessions {
	private readonly sessionCache = new Map<StableId, Session>();
	private readonly sessionMap = new BTree<NumericUuid, Session>(undefined, compareBigints);
	private readonly sessionList: Session[] = [];

	public constructor(sessions?: [NumericUuid, Session][]) {
		if (sessions !== undefined) {
			// bulk load path
			this.sessionList = sessions.map((session) => session[1]);
			for (const [numeric, session] of sessions) {
				this.sessionCache.set(stableIdFromNumericUuid(numeric), session);
			}
			this.sessionMap = new BTree(sessions, compareBigints);
			assert(
				this.sessionCache.size === this.sessionList.length &&
					this.sessionList.length === this.sessionMap.size,
				"Cannot resume existing session.",
			);
		}
	}

	public get sessions(): readonly Session[] {
		return this.sessionList;
	}

	public getOrCreate(sessionId: SessionId): Session {
		const existing = this.sessionCache.get(sessionId);
		if (existing !== undefined) {
			return existing;
		}
		const session = new Session(sessionId);
		this.sessionList.push(session);
		assert(this.sessionMap.set(session.sessionUuid, session), "Duplicate session in map.");
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
		const possibleMatch = this.sessionMap.getPairOrNextLower(numericStable);
		if (possibleMatch === undefined) {
			return undefined;
		}
		const [_, session] = possibleMatch;
		const alignedLocal = localIdFromGenCount(
			Number(subtractNumericUuids(numericStable, session.sessionUuid)) + 1,
		);
		const containingCluster = session.getClusterByLocal(alignedLocal, true);
		if (containingCluster === undefined) {
			return undefined;
		}
		return [containingCluster, alignedLocal];
	}

	public clusterCollides(owningSession: Session, cluster: IdCluster): boolean {
		const clusterBaseNumeric = offsetNumericUuid(
			owningSession.sessionUuid,
			genCountFromLocalId(cluster.baseLocalId) - 1,
		);
		const clusterMaxNumeric = offsetNumericUuid(clusterBaseNumeric, cluster.capacity - 1);
		let closestMatch: [NumericUuid, Session] | undefined =
			this.sessionMap.getPairOrNextLower(clusterMaxNumeric);
		// Find the first non-empty session that is not the owner of this new cluster.
		// Once we have that, check to see if its cluster chain overlaps with the new cluster.
		// Consider the following diagram of UUID space:
		// Cluster chain A:  |----------------------|
		// Cluster chain B:       |----------|
		// Cluster chain C:                       |-------|
		// While it is true that when adding a cluster to chain C, we would find
		// the next lower session (which is B) and erroneously determine we do not collide
		// with any other session, but this situation is impossible to get into as B would
		// have detected that it collided with A (or the other way around, depending on ordering).
		while (
			closestMatch !== undefined &&
			(closestMatch[1] === owningSession || closestMatch[1].isEmpty())
		) {
			closestMatch = this.sessionMap.nextLowerPair(closestMatch[0]);
		}
		if (closestMatch === undefined) {
			return false;
		}

		const [_, session] = closestMatch;
		assert(session !== owningSession, "Failed to attempt to detect collisions.");
		const lastCluster = session.getTailCluster();
		if (lastCluster === undefined) {
			return false;
		}
		const lastAllocatedNumeric = offsetNumericUuid(
			session.sessionUuid,
			genCountFromLocalId(lastAllocatedLocal(lastCluster)) - 1,
		);
		return lastAllocatedNumeric >= clusterBaseNumeric;
	}

	public equals(other: Sessions, includeLocalState: boolean): boolean {
		const emptySessionsThis: Session[] = [];
		for (const [stableId, session] of this.sessionCache.entries()) {
			if (session.getTailCluster() === undefined) {
				emptySessionsThis.push(session);
			} else {
				const otherSession = other.sessionCache.get(stableId);
				if (otherSession === undefined || !otherSession.equals(session)) {
					return false;
				}
			}
		}
		const emptySessionsOther: Session[] = [];
		other.sessionList.forEach((session) => {
			if (session.getTailCluster() === undefined) {
				emptySessionsOther.push(session);
			}
		});
		assert(
			emptySessionsThis.length <= 1 && emptySessionsOther.length <= 1,
			"Only the local session can be empty.",
		);
		return (
			!includeLocalState ||
			emptySessionsThis.length === 0 ||
			emptySessionsThis[0].equals(emptySessionsOther[0])
		);
	}
}

/**
 * The IDs created by a specific session, stored as a cluster chain to allow for fast searches.
 */
export class Session {
	// All clusters created by this session, in creation order (thus sorted by base final and local ID).
	private readonly clusterChain: IdCluster[] = [];
	public readonly sessionUuid: NumericUuid;

	public constructor(sessionId: SessionId | NumericUuid) {
		this.sessionUuid =
			typeof sessionId === "string" ? numericUuidFromStableId(sessionId) : sessionId;
	}

	public addEmptyCluster(
		baseFinalId: FinalCompressedId,
		baseLocalId: LocalCompressedId,
		capacity: number,
	): IdCluster {
		const newCluster: IdCluster = {
			session: this,
			baseFinalId,
			baseLocalId,
			capacity,
			count: 0,
		};
		this.clusterChain.push(newCluster);
		return newCluster;
	}

	public isEmpty(): boolean {
		return this.clusterChain.length === 0;
	}

	public getTailCluster(): IdCluster | undefined {
		return this.isEmpty() ? undefined : this.clusterChain[this.clusterChain.length - 1];
	}

	public tryConvertToFinal(
		searchLocal: LocalCompressedId,
		includeAllocated: boolean,
	): FinalCompressedId | undefined {
		const containingCluster = this.getClusterByLocal(searchLocal, includeAllocated);
		if (containingCluster === undefined) {
			return undefined;
		}
		return getAllocatedFinal(containingCluster, searchLocal);
	}

	public getClusterByLocal(
		localId: LocalCompressedId,
		includeAllocated: boolean,
	): IdCluster | undefined {
		const lastValidLocal: (cluster: IdCluster) => LocalCompressedId = includeAllocated
			? lastAllocatedLocal
			: lastFinalizedLocal;
		const matchedCluster = binarySearch(
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

	public getClusterByAllocatedFinal(final: FinalCompressedId): IdCluster | undefined {
		return Session.getContainingCluster(final, this.clusterChain);
	}

	public static getContainingCluster(
		finalId: FinalCompressedId,
		sortedClusters: IdCluster[],
	): IdCluster | undefined {
		return binarySearch(finalId, sortedClusters, (final, cluster) => {
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

	public equals(other: Session): boolean {
		for (let i = 0; i < this.clusterChain.length; i++) {
			if (!clustersEqual(this.clusterChain[i], other.clusterChain[i])) {
				return false;
			}
		}
		return this.sessionUuid === other.sessionUuid;
	}
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

export function getAllocatedFinal(
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

export function getAlignedLocal(
	cluster: IdCluster,
	finalWithin: FinalCompressedId,
): LocalCompressedId | undefined {
	if (finalWithin < cluster.baseFinalId || finalWithin > lastAllocatedFinal(cluster)) {
		return undefined;
	}
	const finalDelta = finalWithin - cluster.baseFinalId;
	return (cluster.baseLocalId - finalDelta) as LocalCompressedId;
}

export function lastAllocatedFinal(cluster: IdCluster): FinalCompressedId {
	return ((cluster.baseFinalId as number) + (cluster.capacity - 1)) as FinalCompressedId;
}

export function lastFinalizedFinal(cluster: IdCluster): FinalCompressedId {
	return ((cluster.baseFinalId as number) + (cluster.count - 1)) as FinalCompressedId;
}

export function lastAllocatedLocal(cluster: IdCluster): LocalCompressedId {
	return ((cluster.baseLocalId as number) - (cluster.capacity - 1)) as LocalCompressedId;
}

export function lastFinalizedLocal(cluster: IdCluster): LocalCompressedId {
	return ((cluster.baseLocalId as number) - (cluster.count - 1)) as LocalCompressedId;
}
