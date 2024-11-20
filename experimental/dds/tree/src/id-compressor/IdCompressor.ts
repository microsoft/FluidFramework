/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from '@fluidframework/core-interfaces';
import { assert } from '@fluidframework/core-utils/internal';
import { ITelemetryLoggerExt, createChildLogger } from '@fluidframework/telemetry-utils/internal';
import { BTree } from '@tylerbu/sorted-btree-es6';

import {
	Mutable,
	assertNotUndefined,
	assertWithMessage,
	compareFiniteNumbers,
	compareFiniteNumbersReversed,
	compareMaps,
	compareStrings,
	fail,
	getOrCreate,
	hasLength,
	setPropertyIfDefined,
} from '../Common.js';
import {
	AttributionId,
	CompressedId,
	FinalCompressedId,
	LocalCompressedId,
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
	UuidString,
} from '../Identifiers.js';
import { assertIsStableId, assertIsUuidString, isStableId } from '../UuidUtilities.js';

import { AppendOnlySortedMap } from './AppendOnlySortedMap.js';
import { getIds } from './IdRange.js';
import {
	NumericUuid,
	ensureSessionUuid,
	getPositiveDelta,
	incrementUuid,
	numericUuidEquals,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
} from './NumericUuid.js';
import { SessionIdNormalizer } from './SessionIdNormalizer.js';
import type {
	IdCreationRange,
	SerializedCluster,
	SerializedClusterOverrides,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SerializedLocalState,
	SerializedSessionData,
	UnackedLocalId,
	VersionedSerializedIdCompressor,
} from './persisted-types/index.js';

/**
 * A cluster of final (sequenced via consensus), sequentially allocated compressed IDs.
 * A final ID in a cluster decompresses to a UUID that is one of the following:
 * 1. A sequentially allocated UUID that is the result of adding its offset within the cluster to `baseUuid`.
 * 2. An override string (stored in `overrides`) specified at allocation time.
 */
interface IdCluster {
	/**
	 * The UUID corresponding to the first final ID in the cluster.
	 */
	readonly baseUuid: NumericUuid;

	/**
	 * The total number of final IDs reserved for allocation in the cluster.
	 * Clusters are reserved in blocks as a performance optimization.
	 */
	capacity: number;

	/**
	 * The number of final IDs currently allocated in the cluster.
	 */
	count: number;

	/**
	 * The session in which this cluster was created
	 */
	readonly session: Session;

	/**
	 * Final IDs assigned override strings within this cluster.
	 * These are one of the following:
	 *
	 * 1. The override string
	 *
	 * 2. The override string and external override details. This occurs when local IDs corresponding to the same
	 * override string are created by different sessions before any have been finalized. This can occur due to
	 * concurrency or offline. In this case, the string is stored for the final ID that got sequenced first, and that
	 * final ID is stored associated with all subsequent final IDs with the same override.
	 *
	 * When a final ID which is safely reserved via consensus as part of a cluster (but is not yet sequenced) is
	 * allocated with an override, this collection will be temporarily inaccurate as it will not contain an entry for
	 * that final ID. This absence indicates the uncertainty about what the final ID associated with that override will
	 * be after finalizing the range (which could change due to unification of a concurrent duplicate override).
	 * This table will be adjusted to reflect the override when that final ID is finalized via consensus, and
	 * decompression will use `clustersAndOverridesInversion` until that point.
	 */
	overrides?: Map<FinalCompressedId, string | UnifiedOverride>;
}

type UnifiedOverride = OverrideCompressionDetails & {
	override: string;
};

/**
 * Data about a SharedTree session.
 * Used to track and allocate identity clusters associated with a particular session ID.
 */
interface Session {
	readonly sessionUuid: NumericUuid;

	/**
	 * `cluster` is undefined if a new cluster must be allocated when the session requests the next final ID allocation.
	 */
	currentClusterDetails: { readonly clusterBase: FinalCompressedId; readonly cluster: IdCluster } | undefined;

	/**
	 * The last local ID known to be finalized for this session.
	 */
	lastFinalizedLocalId: LocalCompressedId | undefined;

	/**
	 * The attribution ID for the session
	 */
	readonly attributionId: AttributionId;
}

/**
 * Roughly equates to a minimum of 1M sessions before we start allocating 64 bit IDs.
 * This value must *NOT* change without careful consideration to compatibility.
 */
export const defaultClusterCapacity = 512;

/**
 * The base UUID for the reserved id cluster.
 * This should not be changed without consideration to compatibility.
 */
const reservedSessionId = ensureSessionUuid(assertIsStableId('decaf40b-3c1a-47f8-a7a1-e8461ddb69ce'));

/**
 * The ID override for the initial tree of a SharedTree. An artifact of an unfortunate typo which included an extraneous '6' on the UUID
 * which must be forever preserved for backwards compatibility.
 */
export const legacySharedTreeInitialTreeId = `24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6`;

/**
 * @returns true if the supplied ID is a final ID.
 */
export function isFinalId(id: CompressedId): id is FinalCompressedId {
	return id >= 0;
}

/**
 * @returns true if the supplied ID is a local ID.
 */
export function isLocalId(id: CompressedId): id is LocalCompressedId {
	return id < 0;
}

/**
 * A cluster in `clustersAndOverridesInversion`, which is mapped from the first stable ID in a cluster.
 */
interface ClusterInfo {
	readonly clusterBase: FinalCompressedId;
	readonly cluster: IdCluster;
}

interface OverrideCompressionDetails {
	readonly originalOverridingFinal: FinalCompressedId;
	readonly associatedLocalId?: LocalCompressedId;
}

/**
 * An override with a final ID associated with it.
 *
 * `associatedLocalId` is present on this type when a local ID in this session is associated with the override.
 *
 * It may be present even when `overriddenFinalId` was created by another session. This occurs when local IDs corresponding to the
 * same override string are created by different sessions before any have been finalized. `overriddenFinalId` will be set to
 * the *first* finalized ID with that string, but `associatedLocal` will be set to the local session's local ID for that string. This is
 * done to preserve the invariant that an override will always compress into the same session-space ID for the lifetime of the session.
 */
interface FinalizedOverride extends OverrideCompressionDetails {
	readonly cluster: IdCluster;
}

/**
 * The value of a mapping in `clustersAndOverridesInversion`, which maps an override to the cluster containing it (if finalized) or the
 * local ID corresponding to it (if unfinalized).
 *
 * Override strings associated with local IDs stored in `clustersAndOverridesInversion` are *always* replaced immediately upon finalizing,
 * and thus it is typed as op-space (unacked local).
 */
type Override = UnackedLocalId | FinalizedOverride;

type CompressionMapping = ClusterInfo | Override;

/** Prepended to all keys in {@link IdCompressor.clustersAndOverridesInversion} that are override strings and not valid `StableIds` */
const nonStableOverridePrefix = '\ue15e'; // A character in the Private Use Area of the BMP (https://en.wikipedia.org/wiki/Private_Use_Areas)

/** Keys of {@link IdCompressor.clustersAndOverridesInversion} */
type InversionKey = `${typeof nonStableOverridePrefix}${string}` | StableId;

/**
 * A distributed UUID generator and compressor.
 *
 * Generates arbitrary non-colliding v4 UUIDs, called stable IDs, for multiple "sessions" (which can be distributed across the network),
 * providing each session with the ability to map these UUIDs to `numbers`.
 *
 * A session is a unique identifier that denotes a single compressor. New IDs are created through a single compressor API
 * which should then sent in ranges to the server for total ordering (and are subsequently relayed to other clients). When a new ID is
 * created it is said to be created by the compressor's "local" session.
 *
 * For each stable ID created, two numeric IDs are provided by the compressor:
 *
 * 1. A local ID, which is stable for the lifetime of the session (which could be longer than that of the compressor object, as it may
 * be serialized for offline usage). Available as soon as the stable ID is allocated. Local IDs are session-unique and are thus only
 * publicly usable by the compressor that created the stable ID.
 *
 * 2. A final ID, which is stable across serialization and deserialization of an IdCompressor. Available as soon as the range containing
 * the corresponding local ID is totally ordered (via consensus) with respect to other sessions' allocations.
 * Final IDs are known to and publicly usable by any compressor that has received them.
 *
 * Compressors will allocate UUIDs in non-random ways to reduce entropy allowing for optimized storage of the data needed
 * to map the UUIDs to the numbers.
 *
 * A client may optionally supply an "override" for any generated ID, associating an arbitrary string with the local/final ID rather than
 * the UUID that would otherwise be created.
 *
 * The following invariants are upheld by IdCompressor:
 *
 * 1. Local IDs will always decompress to the same UUIDs (or override string) for the lifetime of the session.
 *
 * 2. Final IDs will always decompress to the same UUIDs (or override string).
 *
 * 3. After a server-processed range of local IDs (from any session) is received by a compressor, any of those local IDs may be
 * translated by the compressor into the corresponding final ID. For any given local ID, this translation will always yield the
 * same final ID.
 *
 * 4. A UUID (or override string) will always compress into the same session-space ID for the lifetime of the session.
 *
 * Local IDs are sent across the wire in efficiently-represented ranges. These ranges are created by querying the compressor, and *must*
 * be ordered (i.e. sent to the server) in the order they are created in order to preserve the above invariants.
 *
 * Session-local IDs can be used immediately after creation, but will eventually (after being sequenced) have a corresponding final ID. This
 * could make reasoning about equality of those two forms (the local and final) difficult. For example, if a cache is keyed off of a
 * local ID but is later queried using the final ID (which is semantically equal, as it decompresses to the same UUID/string) it will
 * produce a cache miss. In order to make using collections of both remotely created and locally created IDs easy, regardless of whether the
 * session-local IDs have been finalized, the compressor defines two "spaces" of IDs:
 *
 * 1. Session space: in this space, all IDs are normalized to their "most local form". This means that all IDs created by the local session
 * will be in local form, regardless of if they have been finalized. Remotely created IDs, which could only have been received after
 * finalizing and will never have a local form for the compressor, will of course be final IDs. This space should be used with consumer APIs
 * and data structures, as the lifetime of the IDs is guaranteed to be the same as the compressor object. Care must be taken to not use
 * these IDs across compressor objects, as the local IDs are specific to the compressor that created them.
 *
 * 2. Op space: in this space, all IDs are normalized to their "most final form". This means that all IDs except session-local IDs that
 * have not yet been finalized will be in final ID form. This space is useful for serialization in ops (e.g. references), as other clients
 * that receive them need not do any work to normalize them to *their* session-space in the common case. Note that IDs in op space may move
 * out of Op space over time, namely, when a local ID in this space becomes finalized, and thereafter has a "more final form".
 * Consequentially, it may be useful to restrict parameters of a persisted type to this space (to optimize perf), but it is potentially
 * incorrect to use this type for a runtime variable. This is an asymmetry that does not affect session space, as local IDs are always as
 * "local as possible".
 *
 * These two spaces naturally define a rule: consumers of compressed IDs should use session-space IDs, but serialized forms such as ops
 * should use op-space IDs.
 *
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
		assert(value > 0, 0x640 /* Clusters must have a positive capacity */);
		assert(value <= IdCompressor.maxClusterSize, 0x641 /* Clusters must not exceed max cluster size */);
		this.newClusterCapacity = value;
	}

	/**
	 * The UUID used for attribution of identities created by this compressor
	 */
	public get attributionId(): AttributionId {
		return this.localSession.attributionId;
	}

	/**
	 * Session ID -\> data about the session's current cluster.
	 * Sessions are mutable, and thus should only be created via `createSession`.
	 */
	private readonly sessions = new Map<SessionId, Session>();

	/**
	 * The `IdCompressor`'s current local session.
	 */
	private readonly localSession: Session;

	/**
	 * The base final ID of the next cluster to be created.
	 */
	private nextClusterBaseFinalId: FinalCompressedId = 0 as FinalCompressedId;

	/**
	 * Total number of IDs created locally during the current session.
	 */
	private localIdCount = 0;

	/**
	 * The most recent (i.e. smallest, due to being negative) local ID in a range returned by `takeNextCreationRange`.
	 * Undefined if no non-empty ranges have ever been returned by this compressor.
	 */
	private lastTakenLocalId: LocalCompressedId | undefined;

	/**
	 * Maps local IDs to override strings. This will contain an entry for every override assigned to a local ID generated during
	 * the current session, and retains entries for the lifetime of this compressor.
	 */
	private readonly localOverrides = new AppendOnlySortedMap<LocalCompressedId, string>(compareFiniteNumbersReversed);

	/**
	 * Maps local IDs to the final ID they are associated with (if any), and maps final IDs to the corresponding local ID (if any).
	 * This is used to efficiently compute normalization. This map can be thought of as mapping ranges of "optimistic uncertainty"
	 * (local IDs) to the result of consensus (reserved ranges of final IDs, a.k.a. clusters). Any given range of local IDs
	 * does not necessarily span an entire cluster, as some session-space IDs may be allocated *after* a cluster has been allocated
	 * but before it is full. In this case, there is no uncertainty, as the range of final IDs was reserved when the cluster was created.
	 * However, there is always a range of local IDs with size \>= 1 associated with the beginning of every cluster, as clusters are only
	 * created *after* they are needed and thus there is some period of uncertainty after local IDs have been handed out but before the
	 * range containing them has been finalized. There may also be ranges of local IDs that do not start at the beginning of a
	 * cluster; this happens when a cluster is expanded instead of allocating a new one.
	 * Additionally, session space IDs associated with an override string will also always be local IDs, because there is uncertainty as
	 * to whether another client simultaneously allocated the same override and could get sequenced first (a.k.a. unification) and its
	 * final ID would be associated with that override.
	 * See `SessionIdNormalizer` for more.
	 */
	private sessionIdNormalizer = new SessionIdNormalizer<IdCluster>();

	/**
	 * Contains entries for cluster base UUIDs and override strings (both local and final).
	 * As a performance optimization, entries for finalized strings also include the containing cluster object.
	 * This can be viewed as three separate tables: the inverse table for `localOverrides`, the inverse table for the union of all
	 * the overrides of the clusters in `finalIdToCluster`, and the inverse lookup of cluster base UUIDs to their clusters.
	 * This is unified as a performance optimization, as the common case does not have overridden IDs. It is a btree due to the need
	 * to make range queries.
	 */
	private readonly clustersAndOverridesInversion: BTree<InversionKey, CompressionMapping> = new BTree(
		undefined,
		compareStrings
	);

	/**
	 * Maps the first final ID in a cluster to its owning cluster.
	 * Can be searched in O(log n) to determine clusters for any final ID.
	 */
	private readonly finalIdToCluster: AppendOnlySortedMap<FinalCompressedId, IdCluster> = new AppendOnlySortedMap(
		compareFiniteNumbers
	);

	private readonly logger: ITelemetryLoggerExt;

	/**
	 * @param localSessionId - the `IdCompressor`'s current local session ID.
	 * @param reservedIdCount - the number of IDs that will be known by this compressor without relying on consensus.
	 * The reserved ID count for a given session must be constant for any compressor that contains IDs from that session
	 * (i.e. any DDS that uses the ID compressor must have the same reservedIdCount forever). Compressors with different
	 * reserved ID counts will fail to synchronize their IDs.
	 * @param attributionId - a UUID that identifies the user of this instance of the compressor. IDs created by this
	 * compressor will be associated with this UUID and can be queried later via `attributeID`. If no UUID is provided,
	 * this compressor will generate its own. An `AttributionId` is an `UuidString` which may be validated via
	 * {@link isUuidString} or generated via {@link generateStableId}.
	 */
	public constructor(
		public readonly localSessionId: SessionId,
		public readonly reservedIdCount: number,
		attributionId?: AttributionId,
		logger?: ITelemetryBaseLogger
	) {
		assert(reservedIdCount >= 0, 0x642 /* reservedIdCount must be non-negative */);
		if (attributionId !== undefined) {
			assertIsUuidString(attributionId);
		}
		this.localSession = this.createSession(localSessionId, attributionId);
		if (reservedIdCount > 0) {
			const clusterCapacity = this.clusterCapacity;
			this.clusterCapacity = reservedIdCount;
			const reservedIdRange: IdCreationRange = {
				sessionId: reservedSessionId,
				ids: {
					last: -reservedIdCount as UnackedLocalId,
					overrides: [[-1 as UnackedLocalId, legacySharedTreeInitialTreeId]], // Kludge: see `initialTreeId`
				},
			};
			// Reserved final IDs are implicitly finalized and no one locally created them, so finalizing immediately is safe.
			this.finalizeCreationRange(reservedIdRange);
			this.clusterCapacity = clusterCapacity;
		}

		this.logger = createChildLogger({ logger });
	}

	/**
	 * Creates a session object for the supplied ID.
	 * Must only be called once per ID.
	 * @param sessionId - the ID for the session
	 * @returns the session object for the supplied ID
	 */
	private createSession(sessionId: SessionId, attributionId: AttributionId | undefined): Session {
		assertWithMessage(!this.clustersAndOverridesInversion.has(sessionId));
		const existingSession = this.sessions.get(sessionId);
		if (existingSession !== undefined) {
			fail('createSession must only be called once for each session ID.');
		}
		const sessionUuid = numericUuidFromStableId(sessionId);
		const session: Session = {
			sessionUuid,
			currentClusterDetails: undefined,
			lastFinalizedLocalId: undefined,
			attributionId: attributionId ?? sessionId,
		};
		this.sessions.set(sessionId, session);
		return session;
	}

	/**
	 * Return the nth reserved ID.
	 * @param index - the index of the ID to return
	 */
	public getReservedId(index: number): SessionSpaceCompressedId & FinalCompressedId {
		if (index < 0 || index >= this.reservedIdCount) {
			fail('Reserved Id index out of bounds');
		}

		// All reserved IDs are contiguous and finalized during the Compressor's construction, therefore they are always the lowest
		// final IDs, beginning at 0
		return index as SessionSpaceCompressedId & FinalCompressedId;
	}

	/**
	 * Returns an iterable of all IDs created by this compressor.
	 */
	public getAllIdsFromLocalSession(): IterableIterator<SessionSpaceCompressedId> {
		return this.sessionIdNormalizer[Symbol.iterator]();
	}

	/**
	 * Returns the attribution ID associated with the compressor that created the ID
	 */
	public attributeId(id: SessionSpaceCompressedId): AttributionId {
		const opSpaceNormalizedId = this.normalizeToOpSpace(id);
		if (isLocalId(opSpaceNormalizedId)) {
			return this.attributionId;
		}
		const closestCluster = this.getClusterForFinalId(opSpaceNormalizedId);
		if (closestCluster === undefined) {
			if (this.sessionIdNormalizer.getCreationIndex(opSpaceNormalizedId) !== undefined) {
				return this.attributionId;
			} else {
				fail('Cluster does not exist for final ID');
			}
		}
		const [_, cluster] = closestCluster;
		return cluster.session.attributionId;
	}

	/**
	 * Returns a range of local IDs created by this session in a format for sending to the server for finalizing.
	 * The range will include all local IDs generated via calls to `generateCompressedId` since the last time this method was called.
	 * @returns the range of session-local IDs, which may be empty. This range must be sent to the server for ordering before
	 * it is finalized. Ranges must be sent to the server in the order that they are taken via calls to this method.
	 */
	public takeNextCreationRange(): IdCreationRange {
		const lastLocalInRange = -this.localIdCount as UnackedLocalId;
		const lastTakenNormalized = this.lastTakenLocalId ?? 0;
		assertWithMessage(lastLocalInRange <= lastTakenNormalized);

		// The attribution ID is sent with each range, but it can be elided after the first IDs are allocated.
		const sendAttributionId = this.lastTakenLocalId === undefined;

		let ids: IdCreationRange.Ids | undefined;
		if (lastLocalInRange !== lastTakenNormalized) {
			const firstLocalInRange = (lastTakenNormalized - 1) as UnackedLocalId;
			const overrides = [
				...this.localOverrides.getRange(
					(lastTakenNormalized - 1) as LocalCompressedId,
					lastLocalInRange as LocalCompressedId
				),
			] as (readonly [UnackedLocalId, string])[];
			if (hasLength(overrides, 1)) {
				assertWithMessage(overrides[0][0] <= firstLocalInRange);
				assertWithMessage(overrides[overrides.length - 1][0] >= lastLocalInRange);
				ids = {
					overrides,
				};
				const first = firstLocalInRange === overrides[0][0] ? undefined : firstLocalInRange;
				const last = lastLocalInRange === overrides[overrides.length - 1][0] ? undefined : lastLocalInRange;
				setPropertyIfDefined(first, ids, 'first');
				setPropertyIfDefined(last, ids, 'last');
			} else {
				ids = {
					first: firstLocalInRange,
					last: lastLocalInRange,
				};
			}
			this.lastTakenLocalId = lastLocalInRange;
		}

		const range: Mutable<IdCreationRange> = { sessionId: this.localSessionId };
		if (this.attributionId !== this.localSessionId && sendAttributionId) {
			range.attributionId = this.attributionId;
		}

		if (ids === undefined) {
			return range;
		}

		assert(
			this.lastTakenLocalId === -this.localIdCount && this.lastTakenLocalId !== lastTakenNormalized,
			0x643 /* Non-empty range must properly consume local IDs */
		);

		range.ids = ids;
		return range;
	}

	/**
	 * Finalizes the supplied range of IDs (which may be from either a remote or local session).
	 * @param range - the range of session-local IDs to finalize.
	 */
	public finalizeCreationRange(range: IdCreationRange): void {
		const { sessionId, attributionId } = range;

		const isLocal = sessionId === this.localSessionId;
		const session = this.sessions.get(sessionId) ?? this.createSession(sessionId, attributionId);
		assert(
			range.attributionId === undefined || range.attributionId === session.attributionId,
			0x644 /* A session's attribution ID may never be modified. */
		);

		const ids = getIds(range);
		if (ids === undefined) {
			return;
		}

		const { currentClusterDetails } = session;
		const { cluster: currentCluster, clusterBase: currentBaseFinalId } = currentClusterDetails ?? {
			cluster: undefined,
			clusterBase: undefined,
		};
		const currentClusterExists = currentCluster !== undefined && currentBaseFinalId !== undefined;

		const normalizedLastFinalizedLocal = session.lastFinalizedLocalId ?? 0;
		const { first: newFirstFinalizedLocal, last: newLastFinalizedLocal } = ids;
		assert(newFirstFinalizedLocal === normalizedLastFinalizedLocal - 1, 0x645 /* Ranges finalized out of order. */);

		// The total number of session-local IDs to finalize
		const finalizeCount = normalizedLastFinalizedLocal - newLastFinalizedLocal;
		assert(finalizeCount >= 1, 0x646 /* Cannot finalize an empty range. */);

		let eagerFinalIdCount = 0;
		let initialClusterCount = 0;
		let remainingCount = finalizeCount;
		let newBaseUuid: NumericUuid | undefined;
		if (currentClusterExists) {
			if (isLocal) {
				const lastKnownFinal =
					this.sessionIdNormalizer.getLastFinalId() ??
					fail('Cluster exists but normalizer does not have an entry for it.');
				const lastAlignedFinalInCluster = (currentBaseFinalId +
					Math.min(currentCluster.count + finalizeCount, currentCluster.capacity) -
					1) as FinalCompressedId;
				if (lastAlignedFinalInCluster > lastKnownFinal) {
					this.sessionIdNormalizer.addFinalIds(
						(lastKnownFinal + 1) as FinalCompressedId,
						lastAlignedFinalInCluster,
						currentCluster
					);
				}
			}
			initialClusterCount = currentCluster.count;
			const remainingCapacity = currentCluster.capacity - initialClusterCount;
			const overflow = remainingCount - remainingCapacity;
			const hasRoom = overflow <= 0;
			if (hasRoom || currentBaseFinalId === this.finalIdToCluster.maxKey()) {
				currentCluster.count += remainingCount;
				eagerFinalIdCount = remainingCount;
				remainingCount = 0;
				// The common case is that there is room in the cluster, and the new final IDs can simply be added to it
				if (!hasRoom) {
					// The cluster is full but is the last in the list of clusters.
					// This allows it to be expanded instead of allocating a new one.
					const expansionAmount = this.newClusterCapacity + overflow;
					const previousCapacity = currentCluster.capacity;
					currentCluster.capacity += expansionAmount;
					this.nextClusterBaseFinalId = (this.nextClusterBaseFinalId + expansionAmount) as FinalCompressedId;
					assert(
						this.nextClusterBaseFinalId < Number.MAX_SAFE_INTEGER,
						0x647 /* The number of allocated final IDs must not exceed the JS maximum safe integer. */
					);
					this.checkClusterForCollision(currentCluster);
					if (isLocal) {
						// Example with cluster size of 3:
						// Ids generated so far:   -1  1  2 -4 -5  <-- note positive numbers are eager finals
						//         Cluster:      [  0  1  2 ]
						// ~ finalizing happens, causing expansion of 2 (overflow) + 3 (cluster capacity) ~
						//        Cluster:       [  0  1  2  3  4  _  _  _ ]
						// corresponding locals:   -1       -4 -5
						//      lastFinalizedLocalId^           ^newLastFinalizedLocalId = -5
						//                  overflow = 2:    ----
						//                       localIdPivot^
						//                    lastFinalizedFinal^
						const newLastFinalizedFinal = (currentBaseFinalId + currentCluster.count - 1) as FinalCompressedId;
						assert(
							session.lastFinalizedLocalId !== undefined,
							0x648 /* Cluster already exists for session but there is no finalized local ID */
						);
						const finalPivot = (newLastFinalizedFinal - overflow + 1) as FinalCompressedId;
						// Inform the normalizer of all IDs that we now know will end up being finalized into this cluster, including the ones
						// that were given out as locals (non-eager) because they exceeded the bounds of the current cluster before it was expanded.
						// It is safe to associate the unfinalized locals with their future final IDs even before the ranges for those locals are
						// actually finalized, because total order broadcast guarantees that any usage of those final IDs will be observed after
						// the finalization of the ranges.
						this.sessionIdNormalizer.registerFinalIdBlock(finalPivot, expansionAmount, currentCluster);
						this.logger?.sendTelemetryEvent({
							eventName: 'SharedTreeIdCompressor:ClusterExpansion',
							sessionId: this.localSessionId,
							previousCapacity,
							newCapacity: currentCluster.capacity,
							overflow,
						});
					}
				}
			} else {
				// The range cannot be fully allocated in the existing cluster, so allocate any space left in it and
				// form a new one by incrementing the previous baseUuid
				newBaseUuid = incrementUuid(currentCluster.baseUuid, currentCluster.capacity);
				currentCluster.count += remainingCapacity;
				eagerFinalIdCount = remainingCapacity;
				remainingCount -= remainingCapacity;
				this.logger?.sendTelemetryEvent({
					eventName: 'SharedTreeIdCompressor:OverfilledCluster',
					sessionId: this.localSessionId,
				});
			}
		} else {
			// Session has never made a cluster, form a new one with the session UUID as the baseUuid
			newBaseUuid = session.sessionUuid;
			if (isLocal) {
				this.logger?.sendTelemetryEvent({
					eventName: 'SharedTreeIdCompressor:FirstCluster',
					sessionId: this.localSessionId,
				});
			}
		}

		// Finalizing a range results in one of three cases:
		// 1. All local IDs are finalized into a new cluster (because there was either never a cluster for that session, or the current
		//		cluster for the session was full).
		// 2. All local IDs are finalized into the existing (current) cluster for the session.
		// 3. Local IDs are finalized into both the current cluster and a new one, as the current cluster did not have enough room.
		let newCluster: IdCluster | undefined;
		let newBaseFinalId: FinalCompressedId | undefined;
		// The first local ID that will be finalized into a new cluster, if there is one.
		// This lets us quickly compare which cluster an override string will go into.
		let localIdPivot: LocalCompressedId | undefined;

		// Need to make a new cluster
		if (newBaseUuid !== undefined) {
			if (remainingCount <= 0) {
				fail('Should not create an empty cluster.');
			}
			if (currentCluster !== undefined && currentCluster.capacity !== currentCluster.count) {
				fail('Cluster must be filled before another is allocated.');
			}

			newBaseFinalId = this.nextClusterBaseFinalId;
			const newCapacity = Math.max(this.newClusterCapacity, remainingCount);
			newCluster = {
				baseUuid: newBaseUuid,
				capacity: newCapacity,
				count: remainingCount,
				session,
			};

			const usedCapacity = finalizeCount - remainingCount;
			localIdPivot = (newFirstFinalizedLocal - usedCapacity) as LocalCompressedId;

			if (isLocal) {
				this.logger?.sendTelemetryEvent({
					eventName: 'SharedTreeIdCompressor:NewCluster',
					sessionId: this.localSessionId,
					clusterCapacity: newCapacity,
					clusterCount: remainingCount,
				});
				this.sessionIdNormalizer.registerFinalIdBlock(newBaseFinalId, newCluster.capacity, newCluster);
			}

			this.checkClusterForCollision(newCluster);
			this.clustersAndOverridesInversion.set(stableIdFromNumericUuid(newCluster.baseUuid), {
				clusterBase: newBaseFinalId,
				cluster: newCluster,
			});
			session.currentClusterDetails = { cluster: newCluster, clusterBase: newBaseFinalId };
			this.nextClusterBaseFinalId = (this.nextClusterBaseFinalId + newCluster.capacity) as FinalCompressedId;
			assert(
				this.nextClusterBaseFinalId < Number.MAX_SAFE_INTEGER,
				0x649 /* The number of allocated final IDs must not exceed the JS maximum safe integer. */
			);
			this.finalIdToCluster.append(newBaseFinalId, newCluster);
		}

		// If there are overrides, we must determine which cluster object (current or overflow) each belongs to and add it.
		const overrides = ids.overrides;
		if (overrides !== undefined) {
			for (let i = 0; i < overrides.length; i++) {
				const [overriddenLocal, override] = overrides[i];
				// Note: recall that local IDs are negative
				assert(i === 0 || overriddenLocal < overrides[i - 1][0], 0x64a /* Override IDs must be in sorted order. */);
				assert(overriddenLocal < normalizedLastFinalizedLocal, 0x64b /* Ranges finalized out of order. */);
				assert(
					overriddenLocal >= newLastFinalizedLocal,
					0x64c /* Malformed range: override ID ahead of range start. */
				);
				let cluster: IdCluster;
				let overriddenFinal: FinalCompressedId;
				if (localIdPivot !== undefined && overriddenLocal <= localIdPivot) {
					// Override is at or past the pivot, so it is in a new cluster.
					assert(
						newCluster !== undefined && newBaseFinalId !== undefined,
						0x64d /* No cluster was created when overflow occurred. */
					);
					cluster = newCluster;
					overriddenFinal = (newBaseFinalId + (localIdPivot - overriddenLocal)) as FinalCompressedId;
				} else {
					// Override was finalized into an existing cluster
					assert(
						currentCluster !== undefined && currentBaseFinalId !== undefined,
						0x64e /* No cluster exists but IDs were finalized. */
					);
					cluster = currentCluster;
					overriddenFinal = (currentBaseFinalId +
						initialClusterCount +
						(normalizedLastFinalizedLocal - overriddenLocal) -
						1) as FinalCompressedId;
				}
				cluster.overrides ??= new Map();

				const inversionKey = IdCompressor.createInversionKey(override);
				const existingIds = this.getExistingIdsForNewOverride(inversionKey, true);
				let overrideForCluster: string | FinalCompressedId;
				let associatedLocal: LocalCompressedId | undefined;
				if (existingIds !== undefined) {
					let mostFinalExistingOverride: CompressedId;
					if (typeof existingIds === 'number') {
						mostFinalExistingOverride = existingIds;
						if (isLocalId(mostFinalExistingOverride)) {
							associatedLocal = mostFinalExistingOverride;
						}
					} else {
						[associatedLocal, mostFinalExistingOverride] = existingIds;
					}
					if (isFinalId(mostFinalExistingOverride)) {
						// A previous range already finalized an ID with this override. See `IdCluster` for more.
						overrideForCluster = mostFinalExistingOverride;
					} else {
						assert(
							!isLocal || mostFinalExistingOverride === overriddenLocal,
							0x64f /* Cannot have multiple local IDs with identical overrides. */
						);
						// This session has created an ID with this override before, but has not finalized it yet. The incoming
						// range "wins" and will contain the final ID associated with that override, regardless of if that range was
						// made by this session or not.
						overrideForCluster = override;
					}
				} else {
					// This is the first time this override has been associated with any ID
					overrideForCluster = override;
				}

				assert(!cluster.overrides.has(overriddenFinal), 0x650 /* Cannot add a second override for final id */);
				if (typeof overrideForCluster === 'string') {
					if (isLocal || associatedLocal === undefined) {
						cluster.overrides.set(overriddenFinal, override);
					} else {
						cluster.overrides.set(overriddenFinal, {
							override,
							originalOverridingFinal: overriddenFinal,
							associatedLocalId: associatedLocal,
						});
					}
				} else {
					const unifiedOverride: UnifiedOverride = {
						override,
						originalOverridingFinal: overrideForCluster,
					};
					setPropertyIfDefined(associatedLocal, unifiedOverride, 'associatedLocalId');
					cluster.overrides.set(overriddenFinal, unifiedOverride);
				}
				const finalizedOverride: Mutable<FinalizedOverride> = {
					cluster,
					originalOverridingFinal: overriddenFinal,
				};
				setPropertyIfDefined(associatedLocal, finalizedOverride, 'associatedLocalId');
				const currentOverride = this.clustersAndOverridesInversion.get(inversionKey);
				if (currentOverride === undefined || IdCompressor.isUnfinalizedOverride(currentOverride)) {
					// Update the map to contain a finalized override, but never update it with future finalized overrides with
					// the same string; those should decompress to the first final ID with that override.
					this.clustersAndOverridesInversion.set(inversionKey, finalizedOverride);
				}
			}
		}

		if (isLocal) {
			this.logger?.sendTelemetryEvent({
				eventName: 'SharedTreeIdCompressor:IdCompressorStatus',
				eagerFinalIdCount: eagerFinalIdCount - (overrides?.length ?? 0),
				localIdCount: remainingCount + (overrides?.length ?? 0),
				overridesCount: overrides?.length ?? 0,
				sessionId: this.localSessionId,
			});
		}

		session.lastFinalizedLocalId = newLastFinalizedLocal;
	}

	private checkClusterForCollision(cluster: IdCluster): void {
		const maxClusterUuid = incrementUuid(cluster.baseUuid, cluster.capacity - 1);
		const maxClusterStableId = stableIdFromNumericUuid(maxClusterUuid);
		const closestMatch = this.clustersAndOverridesInversion.getPairOrNextLower(maxClusterStableId);
		if (closestMatch !== undefined) {
			const [inversionKey, compressionMapping] = closestMatch;
			if (!IdCompressor.isClusterInfo(compressionMapping)) {
				if (
					isStableId(inversionKey) &&
					IdCompressor.uuidsMightCollide(inversionKey, maxClusterStableId, cluster.capacity)
				) {
					const numericOverride = numericUuidFromStableId(inversionKey);
					const delta = getPositiveDelta(maxClusterUuid, numericOverride, cluster.capacity - 1);
					if (delta !== undefined) {
						IdCompressor.failWithCollidingOverride(inversionKey);
					}
				}
			}
		}
	}

	private static failWithCollidingOverride(override: string): void {
		fail(`Override '${override}' collides with another allocated UUID.`);
	}

	private static isClusterInfo(compressionMapping: CompressionMapping): compressionMapping is ClusterInfo {
		return (compressionMapping as ClusterInfo).clusterBase !== undefined;
	}

	private static isUnfinalizedOverride(compressionMapping: CompressionMapping): compressionMapping is UnackedLocalId {
		return typeof compressionMapping === 'number';
	}

	private static createInversionKey(inversionKey: string): InversionKey {
		return isStableId(inversionKey) ? inversionKey : `${nonStableOverridePrefix}${inversionKey}`;
	}

	private static isStableInversionKey(inversionKey: InversionKey): inversionKey is StableId {
		return !inversionKey.startsWith(nonStableOverridePrefix);
	}

	/**
	 * Returns an existing ID associated with an override, or undefined if none exists.
	 */
	private getExistingIdsForNewOverride(
		inversionKey: InversionKey,
		isFinalOverride: boolean
	): SessionSpaceCompressedId | [LocalCompressedId, FinalCompressedId] | undefined {
		const closestMatch = this.clustersAndOverridesInversion.getPairOrNextLower(inversionKey, reusedArray);
		let numericOverride: NumericUuid | undefined;
		let stableOverride: StableId | undefined;
		if (closestMatch !== undefined) {
			const [key, compressionMapping] = closestMatch;
			if (!IdCompressor.isClusterInfo(compressionMapping)) {
				if (key === inversionKey) {
					if (IdCompressor.isUnfinalizedOverride(compressionMapping)) {
						return compressionMapping;
					}
					const finalizedOverride = compressionMapping;
					return finalizedOverride.associatedLocalId !== undefined
						? [finalizedOverride.associatedLocalId, finalizedOverride.originalOverridingFinal]
						: (finalizedOverride.originalOverridingFinal as SessionSpaceCompressedId);
				}
			} else if (IdCompressor.isStableInversionKey(inversionKey)) {
				stableOverride = inversionKey;
				const cluster = compressionMapping.cluster;
				if (IdCompressor.uuidsMightCollide(inversionKey, key as StableId, cluster.capacity)) {
					numericOverride = numericUuidFromStableId(stableOverride);
					const delta = getPositiveDelta(numericOverride, cluster.baseUuid, cluster.capacity - 1);
					if (delta !== undefined) {
						if (!isFinalOverride) {
							if (delta >= cluster.count) {
								// TODO:#283: Properly implement unification
								return undefined;
							}
							return this.normalizeToSessionSpace((compressionMapping.clusterBase + delta) as FinalCompressedId);
						}
					}
				}
			}
		}

		const override =
			numericOverride ?? stableOverride ?? (IdCompressor.isStableInversionKey(inversionKey) ? inversionKey : undefined);

		if (override !== undefined) {
			const sessionSpaceId = this.getCompressedIdForStableId(override);
			if (sessionSpaceId !== undefined) {
				return sessionSpaceId;
			}
		}

		return undefined;
	}

	/**
	 * Check if `a` might be within `range` of `b`, where both are treated as hex numbers.
	 * @param range - an integer
	 */
	private static uuidsMightCollide(a: StableId, b: StableId, range: number): boolean {
		// Check if any of the UUIDs in the cluster collide (i.e. any in [base, base + capacity)).
		// Optimization: All UUIDs in a cluster are the same string up until the last few characters which encode the offset from
		// the cluster base. So, first compute the length of that shared string, and early out if it is different from the override
		// UUID. This way we usually need not do the more expensive check below.
		const hexDigitsToCheck = 32 - Math.ceil(Math.log2(range) / 2);
		if (a.startsWith(b.slice(0, hexDigitsToCheck))) {
			return true;
		}

		return false;
	}

	/**
	 * Helper for retrieving an override.
	 */
	private static tryGetOverride(cluster: IdCluster, finalId: FinalCompressedId): string | undefined {
		const override = cluster.overrides?.get(finalId);
		if (override === undefined) {
			return undefined;
		}
		if (typeof override === 'string') {
			return override;
		}
		return override.override;
	}

	/**
	 * Generates a new compressed ID or returns an existing one.
	 * This should ONLY be called to generate IDs for local operations.
	 * @param override - Specifies a specific string to be associated with the returned compressed ID.
	 * Performance note: assigning override strings incurs a performance overhead.
	 * @returns an existing ID if one already exists for `override`, and a new local ID otherwise. The returned ID is in session space.
	 */
	public generateCompressedId(override?: string): SessionSpaceCompressedId {
		let overrideInversionKey: InversionKey | undefined;
		if (override !== undefined) {
			overrideInversionKey = IdCompressor.createInversionKey(override);
			const existingIds = this.getExistingIdsForNewOverride(overrideInversionKey, false);
			if (existingIds !== undefined) {
				return typeof existingIds === 'number' ? existingIds : existingIds[0];
			}
		}

		// Bump local counter regardless, then attempt to optimistically return a final ID.
		// If the local session has reserved a cluster range via consensus, it is safe to hand out final IDs prior to
		// finalizing the range that includes these locals.
		const newLocalId = -++this.localIdCount as LocalCompressedId;
		const { currentClusterDetails } = this.localSession;
		const { sessionIdNormalizer } = this;
		let eagerFinalId: (FinalCompressedId & SessionSpaceCompressedId) | undefined;
		let cluster: IdCluster | undefined;
		if (currentClusterDetails !== undefined) {
			cluster = currentClusterDetails.cluster;
			const lastFinalKnown = sessionIdNormalizer.getLastFinalId();
			if (lastFinalKnown !== undefined && lastFinalKnown - currentClusterDetails.clusterBase + 1 < cluster.capacity) {
				eagerFinalId = (lastFinalKnown + 1) as FinalCompressedId & SessionSpaceCompressedId;
			}
		}

		if (overrideInversionKey !== undefined) {
			const registeredLocal = sessionIdNormalizer.addLocalId();
			assert(registeredLocal === newLocalId, 0x651 /* Session ID Normalizer produced unexpected local ID */);
			if (eagerFinalId !== undefined) {
				sessionIdNormalizer.addFinalIds(eagerFinalId, eagerFinalId, cluster ?? fail());
			}
			this.localOverrides.append(newLocalId, override ?? fail());
			// Since the local ID was just created, it is in both session and op space
			const compressionMapping = newLocalId as UnackedLocalId;
			this.clustersAndOverridesInversion.set(overrideInversionKey, compressionMapping);
		} else if (eagerFinalId !== undefined) {
			sessionIdNormalizer.addFinalIds(eagerFinalId, eagerFinalId, cluster ?? fail());
			return eagerFinalId;
		} else {
			const registeredLocal = sessionIdNormalizer.addLocalId();
			assert(registeredLocal === newLocalId, 0x652 /* Session ID Normalizer produced unexpected local ID */);
		}

		return newLocalId;
	}

	/**
	 * Decompresses a previously compressed ID into a UUID or override string.
	 * @param id - the compressed ID to be decompressed.
	 * @returns the UUID or override string associated with the compressed ID. Fails if the ID was not generated by this compressor.
	 */
	public decompress(id: SessionSpaceCompressedId | FinalCompressedId): StableId | string {
		return this.tryDecompress(id) ?? fail('Compressed ID was not generated by this compressor');
	}

	/**
	 * Attempts to decompress a previously compressed ID into a UUID or override string.
	 * @param id - the compressed ID to be decompressed.
	 * @returns the UUID or override string associated with the compressed ID, or undefined if the ID was not generated by this compressor.
	 */
	public tryDecompress(id: SessionSpaceCompressedId | FinalCompressedId): StableId | string | undefined {
		if (isFinalId(id)) {
			const possibleCluster = this.getClusterForFinalId(id);
			if (possibleCluster === undefined) {
				// It may be an unfinalized eager final ID, so check with normalizer to get the offset from the session UUID
				const creationIndex = this.sessionIdNormalizer.getCreationIndex(id);
				if (creationIndex !== undefined) {
					return stableIdFromNumericUuid(this.localSession.sessionUuid, creationIndex);
				}
				return undefined;
			} else {
				const [baseFinalId, cluster] = possibleCluster;
				const override = IdCompressor.tryGetOverride(cluster, id);
				if (override !== undefined) {
					return override;
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

			// If this is a local ID with an override, then it must have been allocated on this machine and will be contained in
			// `localOverrides`s. Otherwise, it is a sequential allocation from the session UUID and can simply be negated and
			// added to that UUID to obtain the stable ID associated with it.
			const localOverride = this.localOverrides?.get(id);
			return localOverride ?? stableIdFromNumericUuid(this.localSession.sessionUuid, idOffset - 1);
		}
	}

	/**
	 * Recompresses a decompressed ID, which could be a UUID or an override string.
	 * @param uncompressed - the UUID or override string to recompress.
	 * @returns the `CompressedId` associated with `uncompressed`. Fails if it has not been previously compressed by this compressor.
	 */
	public recompress(uncompressed: string): SessionSpaceCompressedId {
		return this.tryRecompress(uncompressed) ?? fail('No such string has ever been compressed');
	}

	/**
	 * Attempts to recompresses a decompressed ID, which could be a UUID or an override string.
	 * @param uncompressed - the UUID or override string to recompress,
	 * @returns the `CompressedId` associated with `uncompressed` or undefined if it has not been previously compressed by this compressor.
	 */
	public tryRecompress(uncompressed: string): SessionSpaceCompressedId | undefined {
		return this.recompressInternal(uncompressed);
	}

	/**
	 * Helper to compress an uncompressed UUID. It can optionally be supplied with the numeric form of `uncompressedUuid` as a
	 * performance optimization.
	 */
	private recompressInternal(
		uncompressed: string,
		uncompressedUuidNumeric?: NumericUuid
	): SessionSpaceCompressedId | undefined {
		let numericUuid = uncompressedUuidNumeric;
		const inversionKey = IdCompressor.createInversionKey(uncompressed);
		const isStable = IdCompressor.isStableInversionKey(inversionKey);
		const closestMatch = this.clustersAndOverridesInversion.getPairOrNextLower(inversionKey, reusedArray);
		if (closestMatch !== undefined) {
			const [key, compressionMapping] = closestMatch;
			if (!IdCompressor.isClusterInfo(compressionMapping)) {
				if (key === inversionKey) {
					return IdCompressor.isUnfinalizedOverride(compressionMapping)
						? compressionMapping
						: (compressionMapping.associatedLocalId ??
								(compressionMapping.originalOverridingFinal as SessionSpaceCompressedId));
				}
			} else {
				if (!isStable) {
					return undefined;
				}
				const { clusterBase: closestBaseFinalId, cluster: closestCluster } = compressionMapping;
				numericUuid ??= numericUuidFromStableId(inversionKey);
				const uuidOffset = getPositiveDelta(numericUuid, closestCluster.baseUuid, closestCluster.count - 1);
				if (uuidOffset !== undefined) {
					let targetFinalId = (closestBaseFinalId + uuidOffset) as FinalCompressedId;
					const override = closestCluster.overrides?.get(targetFinalId);
					if (typeof override === 'object') {
						if (override.associatedLocalId !== undefined) {
							return override.associatedLocalId;
						}
						// This may be a UUID that should actually compress into a different final ID that it aligns with, due to
						// another session having an identical override (see `IdCluster` for more).
						targetFinalId = override.originalOverridingFinal;
					}
					return this.normalizeToSessionSpace(targetFinalId);
				}
			}
		}

		if (isStable) {
			// May have already computed the numeric UUID, so avoid recomputing if possible
			const sessionSpaceId = this.getCompressedIdForStableId(numericUuid ?? inversionKey);
			if (sessionSpaceId !== undefined) {
				return sessionSpaceId;
			}
		}
		return undefined;
	}

	/**
	 * Normalizes a session space ID into op space.
	 * @param id - the local ID to normalize.
	 * @returns the ID in op space.
	 */
	public normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId {
		if (isFinalId(id)) {
			return id;
		}

		// Check if this local ID has not been allocated yet
		if (-id > this.localIdCount) {
			fail('Supplied local ID was not created by this compressor.');
		}

		// Check if this local ID has not been finalized yet.
		// Comparing lastFinalizedLocalId is a safe check for eager final IDs because the local IDs corresponding to them
		// are never handed out to a consumer, and thus could not be passed into this method.
		const { lastFinalizedLocalId } = this.localSession;
		if (lastFinalizedLocalId === undefined || id < lastFinalizedLocalId) {
			// Eager final IDs do not have overrides in the cluster until finalizing
			// This means that using the normalizer to get the final/cluster associated would succeed but would not have the override,
			// so checking localOverrides first is necessary.
			const override = this.localOverrides.get(id);
			if (override !== undefined) {
				const inversionKey = IdCompressor.createInversionKey(override);
				const compressionMapping = this.clustersAndOverridesInversion.get(inversionKey) ?? fail('Bimap is malformed.');
				return !IdCompressor.isClusterInfo(compressionMapping) &&
					!IdCompressor.isUnfinalizedOverride(compressionMapping) &&
					compressionMapping.associatedLocalId === id
					? compressionMapping.originalOverridingFinal
					: (id as OpSpaceCompressedId);
			}
			const possibleFinal = this.sessionIdNormalizer.getFinalId(id);
			return possibleFinal?.[0] ?? (id as OpSpaceCompressedId);
		}
		const [correspondingFinal, cluster] =
			this.sessionIdNormalizer.getFinalId(id) ??
			fail('Locally created cluster should be added to the map when allocated');
		if (cluster.overrides) {
			const override = cluster.overrides.get(correspondingFinal);
			if (typeof override === 'object' && override.originalOverridingFinal !== undefined) {
				// Rare case of two local IDs with same overrides are created concurrently. See `IdCluster` for more.
				return override.originalOverridingFinal;
			}
		}
		return correspondingFinal;
	}

	/**
	 * Normalizes an ID into session space.
	 * @param id - the ID to normalize. If it is a local ID, it is assumed to have been created by the session corresponding
	 * to `sessionId`.
	 * @param originSessionId - the session from which `id` originated
	 * @returns the session-space ID corresponding to `id`, which might not have been a final ID if the client that created it had not yet
	 * finalized it. This can occur when a client references an ID during the window of time in which it is waiting to receive the ordered
	 * range that contained it from the server.
	 */
	public normalizeToSessionSpace(id: OpSpaceCompressedId, originSessionId: SessionId): SessionSpaceCompressedId;

	/**
	 * Normalizes a final ID into session space.
	 * @param id - the final ID to normalize.
	 * @returns the session-space ID corresponding to `id`.
	 */
	public normalizeToSessionSpace(id: FinalCompressedId): SessionSpaceCompressedId;

	public normalizeToSessionSpace(id: OpSpaceCompressedId, sessionIdIfLocal?: SessionId): SessionSpaceCompressedId {
		if (isLocalId(id)) {
			if (sessionIdIfLocal === undefined || sessionIdIfLocal === this.localSessionId) {
				const localIndex = -id;
				if (localIndex > this.localIdCount) {
					fail('Supplied local ID was not created by this compressor.');
				}
				return id;
			} else {
				const session =
					this.sessions.get(sessionIdIfLocal) ?? fail('No IDs have ever been finalized by the supplied session.');
				const localCount = -id;
				const numericUuid = incrementUuid(session.sessionUuid, localCount - 1);
				return this.compressNumericUuid(numericUuid) ?? fail('ID is not known to this compressor.');
			}
		}

		const normalizedId = this.sessionIdNormalizer.getSessionSpaceId(id);
		if (normalizedId !== undefined) {
			return normalizedId;
		}

		// Check for a unified override finalized first by another session but to which the local session
		// still has an associated local ID.
		const [_, cluster] =
			this.getClusterForFinalId(id) ?? fail('Supplied final ID was not finalized by this compressor.');
		const override = cluster.overrides?.get(id);
		if (typeof override === 'object' && override.associatedLocalId !== undefined) {
			return override.associatedLocalId;
		}
		return id as SessionSpaceCompressedId;
	}

	/**
	 * Returns the session-space compressed ID corresponding to the numeric UUID, or undefined if it is not known to this compressor.
	 * Typically, it will return the session-space ID sequentially aligned with it (which will be local if `numericUuid` was made by
	 * the local session, or final otherwise). However, in the event that the aligned session-space ID was overridden with a UUID
	 * *and* that override UUID was concurrently used in an older ID (earlier, w.r.t. sequencing), this method can return the first
	 * ID to correspond to that override.
	 *
	 * As an example, consider the following two clients:
	 * ClientA, session UUID: A0000000-0000-0000-0000-000000000000
	 * ClientB, session UUID: B0000000-0000-0000-0000-000000000000
	 *
	 * If concurrently, two clients performed:
	 * ClientA: generateCompressedId(override: 'X0000000-0000-0000-0000-000000000000') // aligned with A0000000-0000-0000-0000-000000000000
	 *
	 * ClientB: generateCompressedId() // aligned with B0000000-0000-0000-0000-000000000000
	 * ClientB: generateCompressedId(override: 'X0000000-0000-0000-0000-000000000000') // aligned with B0000000-0000-0000-0000-000000000001
	 *
	 * After sequencing, calling this method and passing the numeric UUID for B0000000-0000-0000-0000-000000000001 would return the
	 * session-space ID corresponding to A0000000-0000-0000-0000-000000000000 (with override X0000000-0000-0000-0000-000000000000).
	 */
	private compressNumericUuid(numericUuid: NumericUuid): SessionSpaceCompressedId | undefined {
		const stableId = stableIdFromNumericUuid(numericUuid);
		const sessionSpaceId = this.recompressInternal(stableId, numericUuid);
		if (sessionSpaceId === undefined) {
			return undefined;
		}
		return sessionSpaceId;
	}

	/**
	 * Returns a compressed ID for the supplied stable ID if it was created by the local session, and undefined otherwise.
	 */
	private getCompressedIdForStableId(stableId: StableId | NumericUuid): SessionSpaceCompressedId | undefined {
		const numericUuid = typeof stableId === 'string' ? numericUuidFromStableId(stableId) : stableId;
		const creationIndex = getPositiveDelta(numericUuid, this.localSession.sessionUuid, this.localIdCount - 1);
		if (creationIndex !== undefined) {
			const sessionSpaceId = this.sessionIdNormalizer.getIdByCreationIndex(creationIndex);
			if (sessionSpaceId !== undefined) {
				return sessionSpaceId;
			}
		}
		return undefined;
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
	 * @returns if `other` is equal to this `IdCompressor`. The equality check includes local session state only if specified.
	 * \@testOnly
	 */
	public equals(other: IdCompressor, compareLocalState: boolean): boolean {
		if (compareLocalState) {
			if (
				this.localIdCount !== other.localIdCount ||
				this.localSessionId !== other.localSessionId ||
				this.lastTakenLocalId !== other.lastTakenLocalId ||
				this.attributionId !== other.attributionId
			) {
				return false;
			}
			if (!this.localOverrides.equals(other.localOverrides, (a, b) => a === b)) {
				return false;
			}
			if (
				!compareMaps(this.sessions, other.sessions, (a, b) =>
					IdCompressor.sessionDataEqual(a, b, true, compareLocalState)
				)
			) {
				return false;
			}
			if (
				!this.sessionIdNormalizer.equals(other.sessionIdNormalizer, (a, b) =>
					IdCompressor.idClustersEqual(a, b, false, compareLocalState)
				)
			) {
				return false;
			}
		} else {
			for (const [keyA, valueA] of this.sessions) {
				const valueB = other.sessions.get(keyA);
				if (valueB === undefined) {
					if (valueA.lastFinalizedLocalId !== undefined) {
						return false;
					}
				} else if (!IdCompressor.sessionDataEqual(valueA, valueB, true, compareLocalState)) {
					return false;
				}
			}

			for (const [keyB, valueB] of other.sessions) {
				const valueA = this.sessions.get(keyB);
				if (valueA === undefined) {
					if (valueB.lastFinalizedLocalId !== undefined) {
						return false;
					}
				}
			}
		}
		if (
			this.nextClusterBaseFinalId !== other.nextClusterBaseFinalId ||
			this.newClusterCapacity !== other.newClusterCapacity
		) {
			return false;
		}
		if (
			!this.finalIdToCluster.equals(other.finalIdToCluster, (a, b) =>
				IdCompressor.idClustersEqual(a, b, true, compareLocalState)
			)
		) {
			return false;
		}

		const missingInOne = (_: string, value: CompressionMapping): { break: boolean } | undefined => {
			if (!compareLocalState && IdCompressor.isUnfinalizedOverride(value)) {
				return undefined;
			}
			return { break: true };
		};

		const compareCompressionMappings = (a, b) => {
			const unfinalizedA = IdCompressor.isUnfinalizedOverride(a);
			const unfinalizedB = IdCompressor.isUnfinalizedOverride(b);
			if (unfinalizedA) {
				if (unfinalizedB) {
					return a === b;
				}
				return false;
			} else if (unfinalizedB) {
				return false;
			}

			if (IdCompressor.isClusterInfo(a)) {
				if (!IdCompressor.isClusterInfo(b) || a.clusterBase !== b.clusterBase) {
					return false;
				}
			} else {
				if (
					IdCompressor.isClusterInfo(b) ||
					(compareLocalState && a.associatedLocalId !== b.associatedLocalId) ||
					a.originalOverridingFinal !== b.originalOverridingFinal
				) {
					return false;
				}
			}
			if (!IdCompressor.idClustersEqual(a.cluster, b.cluster, true, compareLocalState)) {
				return false;
			}
			return true;
		};

		const diff = this.clustersAndOverridesInversion.diffAgainst(
			other.clustersAndOverridesInversion,
			missingInOne,
			missingInOne,
			(_, valA, valB) => {
				if (!compareCompressionMappings(valA, valB)) {
					return { break: true };
				}
				return undefined;
			}
		);

		return diff === undefined;
	}

	private static sessionDataEqual(a: Session, b: Session, checkCluster = true, compareLocalState = true): boolean {
		if (
			a.attributionId !== b.attributionId ||
			!numericUuidEquals(a.sessionUuid, b.sessionUuid) ||
			a.lastFinalizedLocalId !== b.lastFinalizedLocalId
		) {
			return false;
		}
		if (a.currentClusterDetails === undefined || b.currentClusterDetails === undefined) {
			if (a.currentClusterDetails !== b.currentClusterDetails) {
				return false;
			}
			return true;
		}
		if (
			checkCluster &&
			!IdCompressor.idClustersEqual(
				a.currentClusterDetails.cluster,
				b.currentClusterDetails.cluster,
				false,
				compareLocalState
			)
		) {
			return false;
		}
		return true;
	}

	private static idClustersEqual(
		a: IdCluster,
		b: IdCluster,
		checkSessionData = true,
		compareLocalState = true
	): boolean {
		const areEqual =
			numericUuidEquals(a.baseUuid, b.baseUuid) &&
			a.capacity === b.capacity &&
			a.count === b.count &&
			(!checkSessionData || IdCompressor.sessionDataEqual(a.session, b.session, false, compareLocalState)) &&
			(a.overrides === undefined) === (b.overrides === undefined) &&
			(a.overrides === undefined ||
				compareMaps(assertNotUndefined(a.overrides), assertNotUndefined(b.overrides), (a, b) => {
					if (compareLocalState) {
						if (typeof a === 'string' || typeof b === 'string') {
							return a === b;
						}
						const overridesEqual =
							a.override === b.override &&
							a.originalOverridingFinal === b.originalOverridingFinal &&
							(!compareLocalState || a.associatedLocalId === b.associatedLocalId);
						return overridesEqual;
					}

					const uuidA = typeof a === 'string' ? a : a.override;
					const uuidB = typeof b === 'string' ? b : b.override;
					if (
						typeof a !== 'string' &&
						typeof b !== 'string' &&
						a.originalOverridingFinal !== b.originalOverridingFinal
					) {
						return false;
					}
					return uuidA === uuidB;
				}));
		return areEqual;
	}

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 * This includes finalized state as well as un-finalized state and is therefore suitable for use in offline scenarios.
	 */
	public serialize(
		withSession: boolean
	): SerializedIdCompressorWithOngoingSession | SerializedIdCompressorWithNoSession;

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 * This includes finalized state as well as un-finalized state and is therefore suitable for use in offline scenarios.
	 */
	public serialize(withSession: true): SerializedIdCompressorWithOngoingSession;

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 * This only includes finalized state and is therefore suitable for use in summaries.
	 */
	public serialize(withSession: false): SerializedIdCompressorWithNoSession;

	public serialize(withSession: boolean): SerializedIdCompressor {
		const serializedSessions: SerializedSessionData[] = [];
		const sessionIdToSessionIndex = new Map<SessionId, number>();
		const attributionIdToAttributionIndex = new Map<AttributionId, number>();
		let serializedAttributionIds: UuidString[] | undefined;

		for (const [sessionId, session] of this.sessions) {
			const isLocalSession = sessionId === this.localSessionId;
			const includeSession =
				sessionId !== reservedSessionId && // Ignore reserved clusters, but
				(session.lastFinalizedLocalId !== undefined || // always serialize sessions that made final IDs,
					(isLocalSession && withSession)); // include the un-acked local session if requested

			if (includeSession) {
				const sessionData: Mutable<SerializedSessionData> = [sessionId];
				if (session.attributionId !== sessionId) {
					// As an optimization, don't include the attributionId if it is its default (the sessionId)
					// Get the index into the array for the given attribution ID. If it doesn't exist, push it onto the array and update the map.
					sessionData.push(
						getOrCreate(
							attributionIdToAttributionIndex,
							session.attributionId,
							(id) => (serializedAttributionIds ??= []).push(id) - 1
						)
					);
				}
				sessionIdToSessionIndex.set(sessionId, serializedSessions.length);
				serializedSessions.push(sessionData);
			}
		}

		const serializedClusters: SerializedCluster[] = [];
		for (const [baseFinalId, cluster] of this.finalIdToCluster.entries()) {
			const sessionId = stableIdFromNumericUuid(cluster.session.sessionUuid) as SessionId;
			if (sessionId !== reservedSessionId) {
				const sessionIndex =
					sessionIdToSessionIndex.get(sessionId) ?? fail('Session object contains wrong session numeric UUID');

				const serializedCluster: Mutable<SerializedCluster> = [sessionIndex, cluster.capacity];
				if (cluster.count !== cluster.capacity) {
					serializedCluster.push(cluster.count);
				}

				if (cluster.overrides !== undefined) {
					const serializedOverrides: Mutable<SerializedClusterOverrides> = [];
					for (const [finalId, override] of cluster.overrides) {
						const finalIdIndex = finalId - baseFinalId;
						if (typeof override === 'string') {
							serializedOverrides.push([finalIdIndex, override]);
						} else if (override.originalOverridingFinal === finalId) {
							serializedOverrides.push([finalIdIndex, override.override]);
						} else {
							serializedOverrides.push([finalIdIndex, override.override, override.originalOverridingFinal]);
						}
					}
					serializedCluster.push(serializedOverrides);
				}

				serializedClusters.push(serializedCluster);
			}
		}

		// Reserved session not serialized, and local session is present but may not make IDs
		assert(serializedSessions.length - this.sessions.size <= 2, 0x653 /* session not serialized */);

		const serializedIdCompressor: Omit<SerializedIdCompressor, '_versionedSerializedIdCompressor'> = {
			version: currentWrittenVersion,
			reservedIdCount: this.reservedIdCount,
			clusterCapacity: this.clusterCapacity,
			sessions: serializedSessions,
			clusters: serializedClusters,
		};
		setPropertyIfDefined(serializedAttributionIds, serializedIdCompressor, 'attributionIds');

		if (withSession) {
			const serializedWithSession = serializedIdCompressor as Mutable<SerializedIdCompressorWithOngoingSession>;
			serializedWithSession.localSessionIndex = serializedWithSession.sessions.findIndex(
				([sessionId]) => sessionId === this.localSessionId
			);
			if (this.localIdCount > 0) {
				serializedWithSession.localState = {
					localIdCount: this.localIdCount,
					overrides: [...this.localOverrides.entries()].map((entry) => [...entry]),
					lastTakenLocalId: this.lastTakenLocalId,
					sessionNormalizer: this.sessionIdNormalizer.serialize(),
				};
			}

			return serializedWithSession;
		}

		this.logger?.sendTelemetryEvent({
			eventName: 'SharedTreeIdCompressor:SerializedIdCompressorSize',
			size: JSON.stringify(serializedIdCompressor).length,
			clusterCount: serializedIdCompressor.clusters.length,
			sessionCount: serializedIdCompressor.sessions.length,
		});

		return serializedIdCompressor as SerializedIdCompressor;
	}

	/**
	 * Deserialize an serialized IdCompressor that is part of an ongoing session, thereby resuming that session.
	 */
	public static deserialize(serialized: SerializedIdCompressorWithOngoingSession): IdCompressor;

	/**
	 * Deserialize a serialized IdCompressor with a new session.
	 * @param serialized - the serialized compressor state
	 * @param newSessionId - the session ID for the new compressor.
	 * @param attributionId - information used by other clients to attribute IDs made by this client
	 */
	public static deserialize(
		serialized: SerializedIdCompressorWithNoSession,
		newSessionId: SessionId,
		attributionId?: AttributionId
	): IdCompressor;

	public static deserialize(
		...args:
			| [
					serialized: SerializedIdCompressorWithNoSession,
					newSessionIdMaybe: SessionId,
					attributionIdMaybe?: AttributionId,
			  ]
			| [
					serialized: SerializedIdCompressorWithOngoingSession,
					newSessionIdMaybe?: undefined,
					attributionIdMaybe?: undefined,
			  ]
	): IdCompressor {
		const [serialized, newSessionIdMaybe, attributionIdMaybe] = args;

		const {
			clusterCapacity,
			reservedIdCount,
			sessions: serializedSessions,
			clusters: serializedClusters,
			attributionIds: serializedAttributionIds,
		} = serialized;

		let localSessionId: SessionId;
		let attributionId: AttributionId | undefined;
		let serializedLocalState: SerializedLocalState | undefined;
		if (newSessionIdMaybe === undefined) {
			// Alias of serialized, but known to be a SerializedIdCompressorWithOngoingSession
			const [serializedWithSession] = args;
			const serializedSessionData = serializedSessions[serializedWithSession.localSessionIndex];
			localSessionId = serializedSessionData[0];
			const attributionIndex = serializedSessionData[1];
			if (attributionIndex !== undefined) {
				assertWithMessage(serializedAttributionIds !== undefined && serializedAttributionIds.length > attributionIndex);
				attributionId = serializedAttributionIds[attributionIndex];
			}
			serializedLocalState = serializedWithSession.localState;
		} else {
			localSessionId = newSessionIdMaybe;
			attributionId = attributionIdMaybe;
		}

		const compressor = new IdCompressor(localSessionId, reservedIdCount, attributionId);
		compressor.clusterCapacity = clusterCapacity;

		const localOverridesInverse = new Map<string, LocalCompressedId>();
		if (serializedLocalState !== undefined) {
			// Do this part of local rehydration first since the cluster map population needs to query to local overrides
			compressor.localIdCount = serializedLocalState.localIdCount;
			compressor.lastTakenLocalId = serializedLocalState.lastTakenLocalId;
			if (serializedLocalState.overrides !== undefined) {
				for (const [localId, override] of serializedLocalState.overrides) {
					compressor.localOverrides.append(localId, override);
					localOverridesInverse.set(override, localId);
					compressor.clustersAndOverridesInversion.set(
						IdCompressor.createInversionKey(override),
						localId as UnackedLocalId
					);
				}
			}
		}

		const sessionInfos: {
			readonly session: Session;
			readonly sessionId: SessionId;
		}[] = [];
		for (const serializedSession of serializedSessions) {
			const [sessionId, attributionIndex] = serializedSession;
			if (sessionId === localSessionId) {
				assert(hasOngoingSession(serialized), 0x654 /* Cannot resume existing session. */);
				sessionInfos.push({ session: compressor.localSession, sessionId });
			} else {
				let attributionId: AttributionId | undefined;
				if (attributionIndex !== undefined) {
					assert(
						serializedAttributionIds !== undefined && serializedAttributionIds.length > attributionIndex,
						0x655 /* AttributionId index out of bounds */
					);
					attributionId = serializedAttributionIds[attributionIndex];
				}
				const session = compressor.createSession(sessionId, attributionId);
				sessionInfos.push({ session, sessionId });
			}
		}

		for (const serializedCluster of serializedClusters) {
			const { sessionIndex, capacity, count, overrides } = deserializeCluster(serializedCluster);
			const { session, sessionId } = sessionInfos[sessionIndex];
			const { lastFinalizedLocalId, sessionUuid } = session;
			const currentIdCount = lastFinalizedLocalId === undefined ? 0 : -lastFinalizedLocalId;

			const cluster: Mutable<IdCluster> = {
				capacity,
				count,
				baseUuid: incrementUuid(sessionUuid, currentIdCount),
				session,
			};

			const lastFinalizedNormalized = lastFinalizedLocalId ?? 0;
			const clusterBase = compressor.nextClusterBaseFinalId;

			session.lastFinalizedLocalId = (lastFinalizedNormalized - count) as LocalCompressedId;
			session.currentClusterDetails = { clusterBase, cluster };
			compressor.nextClusterBaseFinalId = (compressor.nextClusterBaseFinalId + capacity) as FinalCompressedId;
			compressor.finalIdToCluster.append(clusterBase, cluster);
			compressor.clustersAndOverridesInversion.set(stableIdFromNumericUuid(cluster.baseUuid), {
				clusterBase,
				cluster,
			});

			if (overrides !== undefined) {
				cluster.overrides = new Map();
				for (const [finalIdIndex, override, originalOverridingFinal] of overrides) {
					const finalId = (clusterBase + finalIdIndex) as FinalCompressedId;
					if (originalOverridingFinal !== undefined) {
						const unifiedOverride: Mutable<UnifiedOverride> = {
							override,
							originalOverridingFinal,
						};
						if (serializedLocalState !== undefined) {
							setPropertyIfDefined(localOverridesInverse.get(override), unifiedOverride, 'associatedLocalId');
						}
						cluster.overrides.set(finalId, unifiedOverride);
					} else {
						const associatedLocal = localOverridesInverse.get(override);
						if (associatedLocal !== undefined && sessionId !== localSessionId) {
							// In this case, there is a local ID associated with this override, but this is the first cluster to contain
							// that override (because only the first cluster will have the string serialized). In this case, the override
							// needs to hold that local value.
							cluster.overrides.set(finalId, {
								override,
								originalOverridingFinal: finalId,
								associatedLocalId: associatedLocal,
							});
						} else {
							cluster.overrides.set(finalId, override);
						}
						const finalizedOverride: Mutable<FinalizedOverride> = {
							cluster,
							originalOverridingFinal: finalId,
						};
						if (serializedLocalState !== undefined) {
							setPropertyIfDefined(associatedLocal, finalizedOverride, 'associatedLocalId');
						}
						compressor.clustersAndOverridesInversion.set(IdCompressor.createInversionKey(override), finalizedOverride);
					}
				}
			}
		}

		if (serializedLocalState !== undefined) {
			compressor.sessionIdNormalizer = SessionIdNormalizer.deserialize(
				serializedLocalState.sessionNormalizer,
				(finalId) => {
					const [_, cluster] =
						compressor.finalIdToCluster.getPairOrNextLower(finalId) ??
						fail('Final in serialized normalizer was never created.');
					return cluster;
				}
			);
		}

		assertWithMessage(
			compressor.localSession.lastFinalizedLocalId === undefined ||
				compressor.localIdCount >= -compressor.localSession.lastFinalizedLocalId
		);

		return compressor;
	}

	/**
	 * Converts the given serialized compressor to the current version.
	 * @param serializedCompressor - the serialized compressor to convert. Must not have been serialized with an ongoing session.
	 * @returns a serialized compressor with no ongoing session.
	 */
	public static convertToCurrentVersion(
		serializedCompressor: VersionedSerializedIdCompressor,
		hasSession: false
	): SerializedIdCompressorWithNoSession;

	/**
	 * Converts the given serialized compressor to the current version.
	 * @param serializedCompressor - the serialized compressor to convert. Must have been serialized with an ongoing session.
	 * @returns a serialized compressor with the same ongoing session.
	 */
	public static convertToCurrentVersion(
		serializedCompressor: VersionedSerializedIdCompressor,
		hasSession: true
	): SerializedIdCompressorWithOngoingSession;

	public static convertToCurrentVersion(
		serializedCompressor: VersionedSerializedIdCompressor,
		hasSession: boolean
	): SerializedIdCompressor | undefined {
		if (serializedCompressor.version !== currentWrittenVersion) {
			fail('Unknown SerializedIdCompressor version number');
		}
		const serialized = serializedCompressor as SerializedIdCompressorWithOngoingSession;
		if (hasSession !== hasOngoingSession(serialized)) {
			return undefined;
		}
		return serialized;
	}
}

/**
 * The version of `IdCompressor` that is currently persisted.
 */
const currentWrittenVersion = '0.0.1';

/**
 * @returns whether or not the given serialized ID compressor has an ongoing session.
 */
export function hasOngoingSession(
	serialized: SerializedIdCompressorWithNoSession | SerializedIdCompressorWithOngoingSession
): serialized is SerializedIdCompressorWithOngoingSession {
	return (serialized as Partial<SerializedIdCompressorWithOngoingSession>).localSessionIndex !== undefined;
}

function deserializeCluster(serializedCluster: SerializedCluster): {
	sessionIndex: number;
	capacity: number;
	count: number;
	overrides?: SerializedClusterOverrides;
} {
	const [sessionIndex, capacity, countOrOverrides, overrides] = serializedCluster;
	const hasCount = typeof countOrOverrides === 'number';

	return {
		sessionIndex,
		capacity,
		count: hasCount ? countOrOverrides : capacity,
		overrides: hasCount ? overrides : countOrOverrides,
	};
}

/**
 * Optimization used by the sorted-btree library to avoid allocating tuples every time a lookup method is called.
 * Lookup methods on BTree accept a pre-allocated array that it populates with the result of the lookup and retains no ownership
 * of after the call, so this array may be supplied to any of them. References to this array should not be retained elsewhere and
 * lookup results should be extracted from the tuple immediately after invocation.
 */
const reusedArray: [any, any] = [] as unknown as [any, any];
