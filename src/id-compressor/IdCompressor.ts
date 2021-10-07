/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/restrict-plus-operands */

import BTree from 'sorted-btree';
import { MinimalUuidString, SessionId } from '..';
import { assert, assertNotUndefined, compareBtrees, compareMaps, fail, Mutable } from '../Common';
import { LocalCompressedId, FinalCompressedId, CompressedId, StableId } from '../Identifiers';
import { compareFiniteNumbers, compareStrings } from '../TreeViewUtilities';
import { AppendOnlyDoublySortedMap, AppendOnlySortedMap } from './AppendOnlySortedMap';
import {
	numericUuidEquals,
	getPositiveDelta,
	incrementUuid,
	numericUuidFromUuidString,
	NumericUuid,
	stableIdFromNumericUuid,
	assertIsMinimalUuidString,
} from './NumericUuid';

/**
 * A cluster of final (sequenced via consensus), sequentially allocated compressed IDs.
 * A final ID in a cluster decompresses to a uuid that is one of the following:
 * 1. A sequentially allocated uuid that is the result of adding its offset within the cluster to `baseUuid`.
 * 2. An explicit uuid (stored in `explicitIds`) specified at allocation time.
 */
interface IdCluster {
	readonly baseUuid: NumericUuid;
	readonly capacity: number;
	readonly count: number;

	/**
	 * Explicit IDs assigned final IDs within this cluster.
	 */
	readonly explicitIds?: Map<FinalCompressedId, MinimalUuidString>;
}

/**
 * Data about a SharedTree session.
 * Used to track and allocate identity clusters associated with a particular session ID.
 */
interface Session {
	readonly sessionUuid: NumericUuid;
	/**
	 * Undefined if a new cluster must be allocated when the session requests the next final ID allocation.
	 */
	readonly currentClusterDetails: { clusterBase: FinalCompressedId; cluster: IdCluster } | undefined;
}

/**
 * Roughly equates to a minimum of 1M sessions before we start allocating 64 bit IDs.
 * This value must *NOT* change without careful consideration to compatibility.
 */
export const defaultClusterCapacity = 512;

/**
 * Number of reserved final IDs for special system identities.
 * This value must *NOT* change without careful consideration to compatibility.
 */
export const systemReservedIdCount = 1024;

/**
 * The base uuid for the system-reserved id cluster.
 * This should not be changed without consideration to compatibility.
 */
export const systemReservedUuidBase = '24e26f0b3c1a47f8a7a1e8461ddb69ce' as StableId;

/**
 * Special session uuid for reserved system identities.
 */
const systemSessionUuid =
	numericUuidFromUuidString(systemReservedUuidBase) ?? fail('System guid should be a valid v4 uuid.');

/**
 * @returns true if the supplied compressed ID is a final ID.
 */
export function isFinalId(compressedId: CompressedId): compressedId is FinalCompressedId {
	return compressedId >= 0;
}

/**
 * A generator of final IDs.
 * @param explicitId An optional uuid to be permanently associated with the returned final ID.
 */
export interface FinalIdGenerator {
	generateFinalId(explicitId?: MinimalUuidString): FinalCompressedId;
	generateFinalIdBatch(batchSize: number): void;
}

interface LocalSessionDetails {
	id: SessionId;
	numericId: NumericUuid;
}

/**
 * A distributed uuid generator and compressor.
 *
 * Generates arbitrary non-colliding v4 UUIDs, called stable ids, for multiple sessions (which can be distributed across the network),
 * providing each session with the ability to map these UUIDs to `numbers`.
 * For each stable id, two numbers are provided:
 * 	1. A local id, which is stable for the lifetime of the IdCompressor instance. Available as soon as the stable id is allocated.
 * 	2. A final id, which is stable across serialization and deserialization of an IdCompressor. Available as soon as the allocation
 * 	   of the stable id is totally ordered (via consensus) with respect to other sessions' allocations.
 *
 * For each session, generating local IDs conceptually forms a queue of local IDs waiting to be "finalized". Each time a final ID is
 * generated for that session, it dequeues a local ID and is thereafter guaranteed to decompress to the same UUID as it. If the queue is
 * empty when a final ID is generated, no association with a local ID occurs.
 *
 * Optimized IdCompressors can allocate these UUIDs in non-random ways to reduce entropy allowing for optimized storage of the data needed
 * to map the UUIDs to the numbers.
 *
 * An `IdCompressor` allows a client to supply a predetermined uuid when generating `CompressedId`s, explicitly overriding the uuid that
 * would otherwise be associated with that `CompressedId`. If an explicit uuid is provided to an `IdCompressor`'s nth `LocalCompressedId`
 * allocation, then that same uuid must be provided to the allocation of the nth `CompressedFinalId` (and visa versa).
 */
export class IdCompressor {
	/**
	 * Max allowed cluster size
	 */
	public static maxClusterSize = 2 ** 20;

	/**
	 * Trivially reach consensus on default cluster size and reserved IDs.
	 * These initial values must *NOT* change without careful consideration to compatibility.
	 */
	private newClusterCapacity = defaultClusterCapacity;

	/**
	 * The size of each newly created ID cluster.
	 */
	public get clusterCapacity(): number {
		return this.newClusterCapacity;
	}

	/**
	 * Must only be set with a value upon which consensus has been reached. Value must be greater than zero and less than
	 * `IdCompressor.maxClusterSize`.
	 */
	public set clusterCapacity(value: number) {
		assert(value > 0, 'Clusters must have a positive capacity');
		assert(value <= IdCompressor.maxClusterSize, 'Clusters must not exceed max cluster size');
		this.newClusterCapacity = value;
	}

	/**
	 * Session ID -> data about the session's current cluster.
	 */
	private readonly sessions: Map<SessionId, Session>;
	/**
	 * The base final ID of the next cluster to be created.
	 */
	private nextClusterBaseFinalId: number;

	/**
	 * Total number of IDs created locally during the current session.
	 */
	private localIdCount: number;
	/**
	 * Maps local IDs to explicit IDs. This will contain an entry for every explicit ID assigned to a local ID generated during
	 * the current session, and retains entries for the lifetime of this compressor.
	 */
	private readonly localExplicitIds: Map<LocalCompressedId, MinimalUuidString>;
	/**
	 * Maps local IDs to the cluster they belong to (if any). This can be used to efficiently convert a local ID to a
	 * final ID by finding an entry <= a given local ID (to find the cluster it is associated with) and checking
	 * it against `numFinalizedLocalIds`.
	 */
	private readonly localIdToCluster: AppendOnlyDoublySortedMap<
		LocalCompressedId,
		[FinalCompressedId, IdCluster],
		FinalCompressedId
	>;
	/**
	 * A count of final IDs allocated for the local client (i.e. with the local session ID)
	 */
	private finalizedLocalIdCount: number;
	/**
	 * The local session info.
	 */
	private readonly localSessionDetails: LocalSessionDetails;

	/**
	 * The `IdCompressor`'s current local session ID.
	 */
	public get localSessionId(): SessionId {
		return this.localSessionDetails.id;
	}

	/**
	 * Maps uuid strings to the compressed form of that uuid.
	 * Contains entries for cluster base uuids and explicit uuids (both local and final).
	 * As a performance optimization, entries for base uuids also include the cluster object itself.
	 * This can be viewed as three separate tables: the inverse table for `localExplicitIds`, the inverse table for the union of all
	 * the `explicitIds` of the clusters in `finalIdToCluster`, and the inverse lookup of cluster base uuids to their clusters.
	 * This is unified as a performance optimization, as the common case does not have any explicit IDs.
	 */
	private readonly uuidStringToCompressed: BTree<MinimalUuidString, CompressedId | [FinalCompressedId, IdCluster]>;
	/**
	 * Maps the first final ID in a cluster to its owning cluster.
	 * Can be searched in O(log n) to determine clusters for any final ID.
	 */
	private readonly finalIdToCluster: AppendOnlySortedMap<FinalCompressedId, IdCluster>;

	/**
	 * Collection of all generators created for this compressor.
	 */
	private readonly generators: Record<StableId, FinalIdGenerator> = {};

	public constructor(sessionId: SessionId) {
		this.sessions = new Map();
		this.localIdCount = 0;
		this.localExplicitIds = new Map();
		this.localIdToCluster = new AppendOnlyDoublySortedMap(
			compareFiniteNumbersReversed,
			(value) => value[0],
			(search, value) => {
				return compareFiniteNumbers(search, value[0]);
			}
		);
		this.finalizedLocalIdCount = 0;
		this.localSessionDetails = {
			id: sessionId,
			numericId: numericUuidFromUuidString(sessionId) ?? fail('Uuid provided is not a valid session ID.'),
		};
		this.uuidStringToCompressed = new BTree(undefined, compareStrings);
		this.finalIdToCluster = new AppendOnlySortedMap(compareFiniteNumbers);
		const reservedCluster: IdCluster = {
			baseUuid: systemSessionUuid,
			capacity: systemReservedIdCount,
			count: systemReservedIdCount,
		};
		this.nextClusterBaseFinalId = reservedCluster.count;
		const baseFinalId = 0 as FinalCompressedId;
		this.uuidStringToCompressed.set(systemReservedUuidBase, [baseFinalId, reservedCluster]);
		this.finalIdToCluster.append(baseFinalId, reservedCluster);
	}

	/**
	 * @param sessionId the ID for the session
	 * @returns the session object for the supplied ID
	 */
	private getOrCreateSession(sessionId: SessionId, isLocal: boolean): Session {
		assertIsMinimalUuidString(sessionId);
		let existingSession = this.sessions.get(sessionId);
		if (existingSession === undefined) {
			const uuid = isLocal ? this.localSessionDetails.numericId : numericUuidFromUuidString(sessionId);
			assert(uuid !== undefined, 'Uuid provided is not a valid session ID.');
			assert(!this.uuidStringToCompressed.has(sessionId));
			existingSession = {
				sessionUuid: uuid,
				currentClusterDetails: undefined,
			};
			this.sessions.set(sessionId, existingSession);
		}

		return existingSession;
	}

	/**
	 * Provides a callable generator of final IDs for the supplied session ID.
	 * The returned generator must only be used to generate IDs for a sequenced operation.
	 * @param sessionId The session ID of the client that created the sequenced operation.
	 */
	public getFinalIdGenerator(sessionId: SessionId): FinalIdGenerator {
		// This method is optimized for performance. Unlike allocation of local IDs, it exposes a generator for batch allocation.
		// This amortizes the significant cost incurred preparing to allocate final IDs across batches.
		assertIsMinimalUuidString(sessionId);
		let generator: FinalIdGenerator | undefined = this.generators[sessionId];
		if (generator === undefined) {
			const isLocal = sessionId === this.localSessionDetails.id;
			const session = this.getOrCreateSession(sessionId, isLocal);
			const { currentClusterDetails } = session;

			let currentBaseFinalId: FinalCompressedId | undefined;
			let currentCluster: Mutable<IdCluster> | undefined;
			if (currentClusterDetails !== undefined) {
				currentBaseFinalId = currentClusterDetails.clusterBase;
				currentCluster = currentClusterDetails.cluster;
			}

			const generatorFunc = (option: MinimalUuidString | undefined | number): FinalCompressedId => {
				const isBatch = typeof option === 'number';
				const explicitId = isBatch ? undefined : option;
				const batchSize = isBatch ? option : 1;
				let batchSizeRemaining = batchSize;

				// If this explicitId has already been assigned a final ID, there is no need to allocate a new one.
				if (explicitId !== undefined) {
					assertIsMinimalUuidString(explicitId);
					const existingCompressedId = this.getCompressedIdForNewExplicitId(explicitId);
					if (existingCompressedId !== undefined && isFinalId(existingCompressedId)) {
						return existingCompressedId;
					}
				}

				if (isLocal) {
					this.finalizedLocalIdCount += batchSizeRemaining;
					if (this.finalizedLocalIdCount > this.localIdCount) {
						this.localIdCount = this.finalizedLocalIdCount;
					}
				}

				let newBaseUuid: NumericUuid | undefined;
				let remainingCapacity: number;
				if (currentCluster !== undefined && currentBaseFinalId !== undefined) {
					remainingCapacity = currentCluster.capacity - currentCluster.count;
					const overflow = batchSizeRemaining - remainingCapacity;
					const hasRoom = overflow <= 0;
					if (
						hasRoom ||
						(currentCluster.explicitIds === undefined &&
							currentBaseFinalId === this.finalIdToCluster.maxKey())
					) {
						const firstFinalIdInBatch = (currentBaseFinalId + currentCluster.count) as FinalCompressedId;
						currentCluster.count += batchSizeRemaining;
						// Case 1: common case, there is room in the cluster so add new final ID to it
						if (!hasRoom) {
							// Case 2: the cluster is full but is the last in the list of clusters.
							// This allows it to be expanded instead of allocating a new one.
							// Note from the condition above that this is heuristically done only if the cluster to be expanded does
							// not have any explicit IDs, as they slow down operations for all IDs in the cluster.

							// -1 to best-effort align the new capacity to  increments of the client's requested cluster size in the
							// common case where batch size === 1
							const expansionAmount = this.newClusterCapacity + overflow - 1;
							currentCluster.capacity += expansionAmount;
							this.nextClusterBaseFinalId += expansionAmount;
							assert(
								this.nextClusterBaseFinalId < Number.MAX_SAFE_INTEGER,
								'The number of allocated final IDs must not exceed the JS maximum safe integer.'
							);
						}
						if (explicitId !== undefined) {
							this.addExplicitIdToCluster(currentCluster, firstFinalIdInBatch, explicitId);
						}
						return firstFinalIdInBatch;
					} else {
						// Case 3: the batch cannot be fully allocated in the existing cluster, so allocate any space left in it and
						// form a new one by incrementing the previous baseUuid
						newBaseUuid = incrementUuid(currentCluster.baseUuid, currentCluster.capacity);
						currentCluster.count += remainingCapacity;
						batchSizeRemaining -= remainingCapacity;
					}
				} else {
					// Case 4: client has never made a cluster, form a new one with the session uuid as the baseUuid
					remainingCapacity = 0;
					newBaseUuid = session.sessionUuid;
				}

				// Case 3 or 4, need to make a new cluster
				if (currentCluster !== undefined && currentCluster.capacity !== currentCluster.count) {
					fail('Cluster must be filled before another is allocated.');
				}
				const newBaseFinalId = this.nextClusterBaseFinalId as FinalCompressedId;
				const newCluster: Mutable<IdCluster> = {
					baseUuid: newBaseUuid,
					capacity: this.newClusterCapacity + batchSizeRemaining - 1,
					count: batchSizeRemaining,
				};
				if (explicitId !== undefined) {
					this.addExplicitIdToCluster(newCluster, newBaseFinalId, explicitId);
				}
				if (isLocal) {
					this.localIdToCluster.append(
						-(this.finalizedLocalIdCount - (batchSize - remainingCapacity) + 1) as LocalCompressedId,
						[newBaseFinalId, newCluster]
					);
				}

				const maxClusterUuid = incrementUuid(newCluster.baseUuid, newCluster.capacity - 1);
				const maxClusterStableId = stableIdFromNumericUuid(maxClusterUuid);
				const closestMatch = this.uuidStringToCompressed.getPairOrNextLower(maxClusterStableId);
				if (closestMatch !== undefined) {
					const [foundUuidString, compressedResult] = closestMatch;
					if (typeof compressedResult === 'number') {
						if (IdCompressor.uuidsMightCollide(foundUuidString, maxClusterStableId, newCluster.capacity)) {
							const numericExplicit = numericUuidFromUuidString(foundUuidString);
							if (numericExplicit !== undefined) {
								const delta = getPositiveDelta(
									maxClusterUuid,
									numericExplicit,
									newCluster.capacity - 1
								);
								if (delta !== undefined) {
									IdCompressor.failWithCollidingExplicit(foundUuidString);
								}
							}
						}
					}
				}

				this.uuidStringToCompressed.set(stableIdFromNumericUuid(newCluster.baseUuid), [
					newBaseFinalId,
					newCluster,
				]);
				this.sessions.set(sessionId, {
					sessionUuid: session.sessionUuid,
					currentClusterDetails: { cluster: newCluster, clusterBase: newBaseFinalId },
				});
				this.nextClusterBaseFinalId += newCluster.capacity;
				assert(
					this.nextClusterBaseFinalId < Number.MAX_SAFE_INTEGER,
					'The number of allocated final IDs must not exceed the JS maximum safe integer.'
				);
				this.finalIdToCluster.append(newBaseFinalId, newCluster);
				currentCluster = newCluster;
				currentBaseFinalId = newBaseFinalId;
				return newBaseFinalId;
			};

			generator = { generateFinalId: generatorFunc, generateFinalIdBatch: generatorFunc };
			this.generators[sessionId] = generator;
		}

		return generator;
	}

	private static failWithCollidingExplicit(explicitId: MinimalUuidString): void {
		fail(`Explicit ID ${explicitId} collides with another allocated uuid.`);
	}

	private addExplicitIdToCluster(
		cluster: Mutable<IdCluster>,
		finalId: FinalCompressedId,
		explicitId: MinimalUuidString
	): void {
		cluster.explicitIds ??= new Map();
		cluster.explicitIds.set(finalId, explicitId);
		this.uuidStringToCompressed.set(explicitId, finalId);
	}

	private getCompressedIdForNewExplicitId(explicitId: MinimalUuidString): CompressedId | undefined {
		const closestMatch = this.uuidStringToCompressed.getPairOrNextLower(explicitId, reusedArray);
		if (closestMatch !== undefined) {
			const [foundUuidString, compressedResult] = closestMatch;
			const isExplicit = typeof compressedResult === 'number';
			if (isExplicit) {
				return foundUuidString === explicitId ? compressedResult : undefined;
			} else {
				const [_, cluster] = compressedResult;
				if (!IdCompressor.uuidsMightCollide(foundUuidString, explicitId, cluster.capacity)) {
					return undefined;
				}
				const numericExplicit =
					numericUuidFromUuidString(explicitId) ?? fail('Non-v4 uuid generated accidentally.');

				const delta = getPositiveDelta(numericExplicit, cluster.baseUuid, cluster.capacity - 1);
				if (delta === undefined) {
					return undefined;
				}
			}
			IdCompressor.failWithCollidingExplicit(explicitId);
		}
		return undefined;
	}

	private static uuidsMightCollide(a: MinimalUuidString, b: MinimalUuidString, range: number): boolean {
		// Check if any of the UUIDs in the cluster collide (i.e. any in [base, base + capacity)).
		// Optimization: All UUIDs in a cluster are the same string up until the last few characters which encode the offset from
		// the cluster base. So, first compute the length of that shared string, and early out if it is different from the explicit
		// id. This way we usually need not do the more expensive check below.
		const hexDigitsToCheck = 32 - Math.ceil(Math.log2(range) / 2);
		if (a.startsWith(b.slice(0, hexDigitsToCheck))) {
			return true;
		}

		return false;
	}

	/**
	 * Generates a new compressed ID or returns an existing one.
	 * This should ONLY be called to generate IDs for local operations.
	 * @param explicitId Specifies a specific uuid to be associated with the returned compressed ID.
	 * Performance note: assigning explicit IDs incurs a performance overhead and should be avoided if possible.
	 * @returns an existing CompressedId if one already exists for `explicitId`, and a new `LocalCompressedId` otherwise.
	 */
	public generateCompressedId(explicitId?: MinimalUuidString): CompressedId {
		// If any compressed ID exists for this explicit ID (locally or remotely allocated), return it.
		if (explicitId) {
			assertIsMinimalUuidString(explicitId);
			const existingCompressedId = this.getCompressedIdForNewExplicitId(explicitId);
			if (existingCompressedId !== undefined) {
				return existingCompressedId;
			} else {
				const compressedId = this.generateNextLocalId();
				this.localExplicitIds.set(compressedId, explicitId);
				this.uuidStringToCompressed.set(explicitId, compressedId);
				return compressedId;
			}
		} else {
			return this.generateNextLocalId();
		}
	}

	private generateNextLocalId(): LocalCompressedId {
		return -++this.localIdCount as LocalCompressedId;
	}

	/**
	 * Decompresses a previously compressed ID into a uuid.
	 * @param id the compressed ID to be decompressed.
	 * @returns the uuid associated with the compressed ID or undefined if that ID has never been generated.
	 */
	public decompress(id: CompressedId): MinimalUuidString | undefined {
		if (isFinalId(id)) {
			const possibleCluster = this.getClusterForFinalId(id);
			if (possibleCluster === undefined) {
				return undefined;
			} else {
				const [baseFinalId, cluster] = possibleCluster;
				const explicitId = cluster.explicitIds?.get(id);
				if (explicitId !== undefined) {
					return explicitId;
				} else {
					const offsetInCluster = id - baseFinalId;
					return stableIdFromNumericUuid(cluster.baseUuid, offsetInCluster);
				}
			}
		} else {
			const idOffset = -id; // Convert to a positive number
			if (idOffset > this.localIdCount) {
				// This local ID was never allocated.
				return undefined;
			}

			// If this is a local ID with an explicit ID, then it must have been allocated on this machine and will be contained in
			// `localExplicitId`s. Otherwise, it is a sequential allocation from the session uuid and can simply be negated and
			// added to that uuid to obtain the stable ID associated with it.
			const localExplicitId = this.localExplicitIds?.get(id);
			if (localExplicitId !== undefined) {
				return localExplicitId;
			} else {
				return stableIdFromNumericUuid(this.localSessionDetails.numericId, idOffset - 1);
			}
		}
	}

	/**
	 * Recompresses a decompressed uuid.
	 * @param uncompressedUuid the uuid to recompress.
	 * @returns the `CompressedId` associated with the uuid or undefined if it has not been previously compressed by this compressor.
	 */
	public compress(uncompressedUuid: MinimalUuidString): CompressedId | undefined {
		assertIsMinimalUuidString(uncompressedUuid);
		let numericUuid: NumericUuid | undefined;
		const closestMatch = this.uuidStringToCompressed.getPairOrNextLower(uncompressedUuid, reusedArray);
		if (closestMatch !== undefined) {
			const [foundUuidString, compressedResult] = closestMatch;
			const isExplicit = typeof compressedResult === 'number';
			if (isExplicit) {
				if (isFinalId(compressedResult)) {
					const [_, cluster] =
						this.getClusterForFinalId(compressedResult) ?? fail('Cluster tables out of sync');
					const explicitId = cluster?.explicitIds?.get(compressedResult);
					if (explicitId === undefined) {
						fail('No explicit ID for string table entry marked as having one.');
					}
					if (explicitId === uncompressedUuid) {
						return compressedResult;
					}
				} else {
					// Closest match is a local explicit ID
					if (foundUuidString === uncompressedUuid) {
						// Exact match with local ID means it must be an explicit ID, so no cluster math needed.
						return compressedResult;
					}
				}
			} else {
				const [closestBaseFinalId, closestCluster] = compressedResult;
				numericUuid = numericUuidFromUuidString(uncompressedUuid);
				const uuidOffset =
					numericUuid === undefined
						? undefined
						: getPositiveDelta(numericUuid, closestCluster.baseUuid, closestCluster.count - 1);
				if (uuidOffset !== undefined && uuidOffset !== undefined) {
					return (closestBaseFinalId + uuidOffset) as FinalCompressedId;
				}
			}
		}

		if (numericUuid === undefined) {
			numericUuid = numericUuidFromUuidString(uncompressedUuid);
		}
		if (numericUuid !== undefined) {
			const offset = getPositiveDelta(numericUuid, this.localSessionDetails.numericId, this.localIdCount - 1);
			if (offset !== undefined) {
				return (-offset - 1) as LocalCompressedId;
			}
		}
		return undefined;
	}

	/**
	 * Attempts to normalize a `LocalCompressedId` created by the local session into its corresponding final ID.
	 * @param localId the local ID to normalize.
	 * @returns the `FinalCompressedId` corresponding to the local ID or the local ID if it does not exist (has not been finalized).
	 */
	public normalizeToFinal(localId: LocalCompressedId): CompressedId;

	/**
	 * Attempts to normalize a `LocalCompressedId` created by a remote session into its corresponding final ID.
	 * @param remoteLocalId the local ID to normalize.
	 * @param remoteSessionId the session ID that generated the localId. If not provided, it defaults to the local session.
	 * @returns the `FinalCompressedId` corresponding to the local ID, or undefined if the local ID has not been finalized.
	 */
	public normalizeToFinal(
		remoteLocalId: LocalCompressedId,
		remoteSessionId?: SessionId
	): FinalCompressedId | undefined;

	/**
	 * Implementation of `normalizeToFinal`. Public API exposed via overloads above.
	 */
	public normalizeToFinal(localId: LocalCompressedId, sessionId?: SessionId): CompressedId | undefined {
		if (isFinalId(localId)) {
			fail(`${localId} is not an local ID.`);
		}

		const localCounter = -localId;
		if (sessionId === undefined || sessionId === this.localSessionId) {
			// Check if this local ID has not been allocated yet
			if (localCounter > this.localIdCount) {
				fail('Supplied local ID was not created by this compressor.');
			}
			// Check if this local ID has not been finalized yet
			if (localCounter > this.finalizedLocalIdCount) {
				return localId;
			}
			const [localBase, [finalBase]] =
				this.localIdToCluster.getPairOrNextLower(localId) ??
				fail('Locally created cluster should be added to the map when allocated');
			return (finalBase + (localBase + localCounter)) as FinalCompressedId;
		} else {
			const session = this.getOrCreateSession(sessionId, false);
			const stableId = stableIdFromNumericUuid(session.sessionUuid, localCounter - 1);
			const compressedId = this.compress(stableId);
			if (compressedId === undefined || !isFinalId(compressedId)) {
				return undefined;
			}
			return compressedId;
		}
	}

	/**
	 * Attempts to normalize a `CompressedId` into its corresponding local ID.
	 * @param id the compressed ID to normalize.
	 * @returns a normalized compressed ID in the following way:
	 * - If `id` is a final ID created by the local session, return the corresponding local ID.
	 * - Return `id` otherwise.
	 */
	public normalizeToLocal(id: CompressedId): CompressedId {
		if (!isFinalId(id)) {
			const localIndex = -id;
			if (localIndex > this.localIdCount) {
				fail('Supplied local ID was not created by this compressor.');
			}
			return id;
		}
		const closestResult = this.localIdToCluster.getPairOrNextLowerByValue(id);
		if (closestResult === undefined) {
			return id;
		}
		const [localBase, [finalBase, cluster]] = closestResult;
		const indexInCluster = id - finalBase;
		if (indexInCluster >= cluster.count) {
			return id;
		}
		return (localBase - indexInCluster) as LocalCompressedId;
	}

	private getClusterForFinalId(
		finalId: FinalCompressedId
	): readonly [baseFinalId: FinalCompressedId, cluster: IdCluster] | undefined {
		const possibleCluster = this.finalIdToCluster.getPairOrNextLower(finalId);
		if (possibleCluster === undefined) {
			return undefined;
		}
		const [clusterBase, cluster] = possibleCluster;
		if (finalId - clusterBase >= cluster.count) {
			return undefined;
		}
		return possibleCluster;
	}

	/**
	 * @returns if `other` is equal to this `IdCompressor`. The equality check includes local session state.
	 */
	public equals(other: IdCompressor): boolean {
		if (
			this.localIdCount !== other.localIdCount ||
			this.finalizedLocalIdCount !== other.finalizedLocalIdCount ||
			this.nextClusterBaseFinalId !== other.nextClusterBaseFinalId ||
			this.localSessionId !== other.localSessionId ||
			this.newClusterCapacity !== other.newClusterCapacity
		) {
			return false;
		}

		if (
			!this.finalIdToCluster.equals(other.finalIdToCluster, IdCompressor.idClustersEqual) ||
			!compareMaps(this.localExplicitIds, other.localExplicitIds) ||
			!compareMaps(this.sessions, other.sessions, IdCompressor.sessionDataEqual) ||
			!compareBtrees(this.uuidStringToCompressed, other.uuidStringToCompressed, (a, b) => {
				if (typeof a === 'number') {
					return a === b;
				}
				if (typeof b === 'number') {
					return false;
				}
				return a[0] === b[0] && IdCompressor.idClustersEqual(a[1], b[1]);
			})
		) {
			return false;
		}

		return true;
	}

	private static sessionDataEqual(a: Session, b: Session): boolean {
		return (
			numericUuidEquals(a.sessionUuid, b.sessionUuid) &&
			(a.currentClusterDetails === b.currentClusterDetails ||
				(a.currentClusterDetails !== undefined &&
					b.currentClusterDetails !== undefined &&
					a.currentClusterDetails.clusterBase === b.currentClusterDetails.clusterBase &&
					IdCompressor.idClustersEqual(a.currentClusterDetails.cluster, b.currentClusterDetails.cluster)))
		);
	}

	private static idClustersEqual(a: IdCluster, b: IdCluster): boolean {
		const areEqual =
			numericUuidEquals(a.baseUuid, b.baseUuid) &&
			a.capacity === b.capacity &&
			a.count === b.count &&
			(a.explicitIds === undefined) === (b.explicitIds === undefined) &&
			(a.explicitIds === undefined ||
				compareMaps(assertNotUndefined(a.explicitIds), assertNotUndefined(b.explicitIds)));
		return areEqual;
	}

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 */
	public serialize(): SerializedIdCompressor {
		const sessions: SerializedSessionData[] = [];
		const baseUuidToSessionIndex = new Map<StableId, number>();
		const sessionUuidToSessionIndex = new Map<StableId, number>();

		const getPrevClusterInSessionChain = (
			clusterBaseInfo: [StableId, NumericUuid]
		): [StableId, NumericUuid] | undefined => {
			const [clusterBaseStableId, clusterBaseUuid] = clusterBaseInfo;
			const nextLowerCandidate = this.uuidStringToCompressed.nextLowerPair(clusterBaseStableId);
			if (nextLowerCandidate !== undefined) {
				const [closestUuidString, compressedResult] = nextLowerCandidate;
				if (typeof compressedResult === 'object') {
					const [_, cluster] = compressedResult;
					const offset = getPositiveDelta(clusterBaseUuid, cluster.baseUuid, cluster.capacity);
					if (offset !== undefined) {
						assert(
							cluster.count === cluster.capacity && offset === cluster.capacity,
							`${cluster.count} === ${cluster.capacity} && ${offset} === ${cluster.capacity}`
						);
						// We know this is a cluster base uuid, and is thus guaranteed to be a stable ID
						return [closestUuidString as StableId, cluster.baseUuid];
					}
				}
			}
			return undefined;
		};

		for (const [_, cluster] of this.finalIdToCluster.entriesReversed()) {
			const { baseUuid } = cluster;
			const baseStableId = stableIdFromNumericUuid(baseUuid);
			if (baseStableId !== systemReservedUuidBase && !baseUuidToSessionIndex.has(baseStableId)) {
				// Base uuids associated with clusters in a chain made in the same session, in reverse order
				const clusterChain: [StableId, NumericUuid][] = [[baseStableId, baseUuid]];
				let prevClusterBase: [StableId, NumericUuid] | undefined = clusterChain[0];
				while ((prevClusterBase = getPrevClusterInSessionChain(prevClusterBase)) !== undefined) {
					clusterChain.push(prevClusterBase);
				}
				const sessionUuidForChain = clusterChain[clusterChain.length - 1];
				const sessionStableIdForChain = sessionUuidForChain[0] as SessionId;
				let sessionIndex = sessionUuidToSessionIndex.get(sessionStableIdForChain);
				if (sessionIndex === undefined) {
					sessionIndex = sessions.length;
					sessionUuidToSessionIndex.set(sessionStableIdForChain, sessionIndex);
					const session = assertNotUndefined(
						this.sessions.get(sessionStableIdForChain),
						'session cluster chain not in session map'
					);
					const currentClusterDetails = assertNotUndefined(
						session.currentClusterDetails,
						'non-local empty session in session map'
					);
					sessions.push([sessionStableIdForChain, currentClusterDetails.clusterBase]);
				}
				sessionUuidToSessionIndex.set(sessionStableIdForChain, sessionIndex);
				for (const clusterInChain of clusterChain) {
					baseUuidToSessionIndex.set(clusterInChain[0], sessionIndex);
				}
			}
		}

		assert(sessions.length === this.sessions.size, 'session not serialized');

		// Note that half of the compressor's bimap is not needed since it is derivable from `this.compressedIdToStableId`.
		const clusters: SerializedCluster[] = [];
		for (const [_, cluster] of this.finalIdToCluster.entries()) {
			const baseStableId = stableIdFromNumericUuid(cluster.baseUuid);
			// Skip the system reserved cluster
			const { capacity } = cluster;
			if (baseStableId !== systemReservedUuidBase) {
				const sessionIndex = assertNotUndefined(baseUuidToSessionIndex.get(baseStableId));
				const serializedCluster: Mutable<SerializedCluster> = [sessionIndex, capacity];

				if (cluster.count !== cluster.capacity) {
					serializedCluster.push(cluster.count);
				}

				if (cluster.explicitIds !== undefined) {
					const explicitIds: [FinalCompressedId, MinimalUuidString][] = [];
					for (const [finalId, explicitId] of cluster.explicitIds) {
						explicitIds.push([finalId, explicitId]);
					}
					serializedCluster.push(explicitIds);
				}
				clusters.push(serializedCluster);
			}
		}

		const serializedIdCompressor: Mutable<SerializedIdCompressor> = {
			version: currentWrittenVersion,
			newClusterSize: this.newClusterCapacity,
			sessions,
			clusters,
		};

		if (this.localIdCount > 0) {
			serializedIdCompressor.localState = {
				sessionId: this.localSessionId,
				localIdCount: this.localIdCount,
				explicitIds: [...this.localExplicitIds.entries()],
			};
		}

		return serializedIdCompressor;
	}

	/**
	 * Rehydrates an `IdCompressor` from the serialized state.
	 * @param serialized the serialized compressor state
	 * @param localSessionId the session ID for the new compressor. If this is the same as the id of the session in which the compressor
	 * was serialized then local state will be preserved, otherwise it will be dropped.
	 */
	public static deserialize(serialized: SerializedIdCompressorBase, localSessionId: SessionId): IdCompressor {
		let serializedConcrete: SerializedIdCompressor;
		switch (serialized.version) {
			case currentWrittenVersion:
				serializedConcrete = serialized as SerializedIdCompressor;
				break;
			default:
				fail('unknown SerializedIdCompressor version number');
		}
		const { newClusterSize, sessions, clusters, localState } = serializedConcrete;
		const compressor = new IdCompressor(localSessionId);
		compressor.newClusterCapacity = newClusterSize;

		const sessionInfos: {
			readonly sessionUuid: NumericUuid;
			readonly currentClusterBase: FinalCompressedId;
			readonly sessionId: SessionId;
			idsCreated: number;
		}[] = [];
		for (const serializedSession of sessions) {
			const [sessionId, currentClusterBase] = serializedSession;
			const sessionUuid = numericUuidFromUuidString(sessionId) ?? fail('Serialized non-session uuid');
			sessionInfos.push({ sessionUuid, idsCreated: 0, currentClusterBase, sessionId });
		}

		for (const serializedCluster of clusters) {
			const [sessionIndex, capacity] = serializedCluster;
			const third = serializedCluster[2];
			const fourth = serializedCluster[3];
			const sessionInfo = sessionInfos[sessionIndex];
			const sessionUuid = sessionInfo.sessionUuid;
			const explicitSize = typeof third === 'number' ? third : capacity;
			const idsCreated = sessionInfo.idsCreated;
			const cluster: Mutable<IdCluster> = {
				capacity,
				count: explicitSize,
				baseUuid: incrementUuid(sessionUuid, idsCreated),
			};
			sessionInfo.idsCreated += explicitSize;
			const serializedExplicitIds =
				typeof third === 'object' ? third : typeof fourth === 'object' ? fourth : undefined;
			if (serializedExplicitIds !== undefined) {
				cluster.explicitIds = new Map(serializedExplicitIds);
				for (const [finalId, explicitId] of serializedExplicitIds) {
					compressor.uuidStringToCompressed.set(explicitId, finalId);
				}
			}
			const baseFinalId = compressor.nextClusterBaseFinalId as FinalCompressedId;
			if (baseFinalId === sessionInfo.currentClusterBase) {
				compressor.sessions.set(sessionInfo.sessionId, {
					sessionUuid,
					currentClusterDetails: { cluster, clusterBase: baseFinalId },
				});
			}
			compressor.finalIdToCluster.append(baseFinalId, cluster);
			compressor.uuidStringToCompressed.set(stableIdFromNumericUuid(cluster.baseUuid), [baseFinalId, cluster]);
			compressor.nextClusterBaseFinalId += capacity;
		}

		if (localState !== undefined && localState.sessionId === localSessionId) {
			compressor.localIdCount = localState.localIdCount;
			if (localState.explicitIds !== undefined) {
				for (const [localId, explicitId] of localState.explicitIds) {
					compressor.localExplicitIds.set(localId, explicitId);
				}
			}

			let clusterInChainDetails = compressor.uuidStringToCompressed.get(compressor.localSessionDetails.id);
			let finalizedLocalIdCount = 0;
			while (clusterInChainDetails !== undefined) {
				assert(typeof clusterInChainDetails === 'object');
				const [baseFinalId, cluster] = clusterInChainDetails;
				compressor.localIdToCluster.append(-(finalizedLocalIdCount + 1) as LocalCompressedId, [
					baseFinalId,
					cluster,
				]);
				finalizedLocalIdCount += cluster.count;
				clusterInChainDetails = compressor.uuidStringToCompressed.get(
					stableIdFromNumericUuid(
						incrementUuid(compressor.localSessionDetails.numericId, finalizedLocalIdCount)
					)
				);
			}

			compressor.finalizedLocalIdCount = finalizedLocalIdCount;
			assert(compressor.localIdCount >= compressor.finalizedLocalIdCount);
		}

		return compressor;
	}
}

/**
 * The version of `IdCompressor` that is currently persisted.
 */
const currentWrittenVersion = '0.0.1';

/**
 * The minimal required contents of a serialized IdCompressor.
 */
export interface SerializedIdCompressorBase {
	readonly version: string;
}

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export interface SerializedIdCompressor extends SerializedIdCompressorBase {
	readonly newClusterSize: number;
	readonly sessions: readonly SerializedSessionData[];
	readonly clusters: readonly SerializedCluster[];
	readonly localState?: SerializedLocalState;
}

type SerializedLocalIds = readonly [LocalCompressedId, MinimalUuidString][];

interface SerializedLocalState {
	/**
	 * The session ID of the local session
	 */
	sessionId: SessionId;
	/**
	 * The total number of local IDs created by this session
	 */
	localIdCount: number;
	/**
	 * Explicit IDs overriding sequential IDs in this session. Omitted if no local explicit IDs exist in the session.
	 */
	explicitIds?: SerializedLocalIds;
}

/**
 * A serialized ID allocation session for an `IdCompressor`.
 */
type SerializedSessionData = readonly [
	/**
	 * The ID of the session.
	 */
	sessionId: SessionId,

	/**
	 * The first final ID in the cluster most recently allocated by this session.
	 */
	currentClusterBase: FinalCompressedId
];

type SerializedExplicitIds = readonly [FinalCompressedId, MinimalUuidString][];

/**
 * A serialized final ID cluster.
 */
type SerializedCluster = readonly [
	/**
	 * Index into the serialized sessionData array. Can be converted into a baseUuid via its order in `clusters`.
	 */
	sessionIndex: number,

	/**
	 * The capacity of the cluster.
	 */
	capacity: number,

	/**
	 * The size of the cluster. Omitted if size === capacity.
	 */
	size?: number | SerializedExplicitIds,

	/**
	 * Explicit IDs overriding sequential IDs in this cluster. Omitted if no explicit IDs exist in the cluster.
	 */
	explicitIds?: number | SerializedExplicitIds
];

/**
 * Optimization used by the sorted-btree library to avoid allocating tuples every time a lookup method is called.
 * Lookup methods on BTree accept a pre-allocated array that it populates with the result of the lookup and retains no ownership
 * of after the call, so this array may be supplied to any of them. References to this array should not be retained elsewhere and
 * lookup results should be extracted from the tuple immediately after invocation.
 */
const reusedArray: [any, any] = [] as unknown as [any, any];

/**
 * A numeric comparator used for sorting in descending order.
 */
function compareFiniteNumbersReversed<T extends number>(a: T, b: T): number {
	return b - a;
}
