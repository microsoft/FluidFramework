import { assert } from "@fluidframework/common-utils";
import {
	IdCreationRange,
	IIdCompressor,
	IIdCompressorCore,
	OpSpaceCompressedId,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
	currentWrittenVersion,
	defaultClusterCapacity,
} from "@fluidframework/runtime-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { FinalCompressedId, isFinalId, LocalCompressedId, NumericUuid } from "./identifiers";
import {
	createSessionId,
	localIdFromGenCount,
	genCountFromLocalId,
	numericUuidFromStableId,
	offsetNumericUuid,
	readBoolean,
	readNumber,
	readNumericUuid,
	writeBoolean,
	writeNumber,
	writeNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
	fail,
} from "./utilities";
import {
	getAlignedLocal,
	getAllocatedFinal,
	IdCluster,
	lastAllocatedLocal,
	lastFinalizedLocal,
	Session,
	Sessions,
} from "./sessions";
import { SessionSpaceNormalizer } from "./sessionSpaceNormalizer";
import { FinalSpace } from "./finalSpace";

/**
 * See {@link IIdCompressor} and {@link IIdCompressorCore}
 */
export class IdCompressor implements IIdCompressor, IIdCompressorCore {
	/**
	 * Max allowed initial cluster size.
	 */
	public static maxClusterSize = 2 ** 20;

	// ----- Local state -----
	public readonly localSessionId: SessionId;
	private readonly localSession: Session;
	private readonly normalizer = new SessionSpaceNormalizer();
	private generatedIdCount = 0;
	// -----------------------

	// ----- Final state -----
	private nextRangeBaseGenCount: number = 1;
	private newClusterCapacity: number;
	private readonly sessions = new Sessions();
	private readonly finalSpace = new FinalSpace();
	// -----------------------

	// ----- Telemetry state -----
	private telemetryLocalIdCount = 0;
	private telemetryEagerFinalIdCount = 0;
	// -----------------------

	private constructor(
		localSessionIdOrDeserialized: SessionId | { localSessionId: SessionId; sessions: Sessions },
		private readonly logger?: ITelemetryLoggerExt,
	) {
		if (typeof localSessionIdOrDeserialized === "string") {
			this.localSessionId = localSessionIdOrDeserialized;
			this.localSession = this.sessions.getOrCreate(localSessionIdOrDeserialized);
		} else {
			// Deserialize/bulk load case
			this.sessions = localSessionIdOrDeserialized.sessions;
			this.localSessionId = localSessionIdOrDeserialized.localSessionId;
			const localSession = this.sessions.get(this.localSessionId);
			assert(localSession !== undefined, "Malformed sessions on deserialization.");
			this.localSession = localSession;
		}
		this.newClusterCapacity = defaultClusterCapacity;
	}

	public static create(logger?: ITelemetryBaseLogger): IdCompressor;
	public static create(sessionId: SessionId, logger?: ITelemetryBaseLogger): IdCompressor;
	public static create(
		sessionIdOrLogger?: SessionId | ITelemetryBaseLogger,
		loggerOrUndefined?: ITelemetryBaseLogger,
	): IdCompressor {
		let localSessionId: SessionId;
		let logger: ITelemetryBaseLogger | undefined;
		if (sessionIdOrLogger === undefined) {
			localSessionId = createSessionId();
		} else {
			if (typeof sessionIdOrLogger === "string") {
				localSessionId = sessionIdOrLogger;
				logger = loggerOrUndefined;
			} else {
				localSessionId = createSessionId();
				logger = loggerOrUndefined;
			}
		}
		const compressor = new IdCompressor(
			localSessionId,
			logger === undefined ? undefined : createChildLogger({ logger }),
		);
		return compressor;
	}

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
		assert(value > 0, "Clusters must have a positive capacity.");
		assert(value <= IdCompressor.maxClusterSize, "Clusters must not exceed max cluster size.");
		this.newClusterCapacity = value;
	}

	public generateCompressedId(): SessionSpaceCompressedId {
		this.generatedIdCount++;
		const tailCluster = this.localSession.getTailCluster();
		if (tailCluster === undefined) {
			this.telemetryLocalIdCount++;
			return this.generateNextLocalId();
		}
		const clusterOffset = this.generatedIdCount - genCountFromLocalId(tailCluster.baseLocalId);
		if (tailCluster.capacity > clusterOffset) {
			this.telemetryEagerFinalIdCount++;
			// Space in the cluster: eager final
			return ((tailCluster.baseFinalId as number) +
				clusterOffset) as SessionSpaceCompressedId;
		}
		// No space in the cluster, return next local
		this.telemetryLocalIdCount++;
		return this.generateNextLocalId();
	}

	private generateNextLocalId(): LocalCompressedId {
		const newLocal = -this.generatedIdCount as LocalCompressedId;
		this.normalizer.addLocalRange(newLocal, 1);
		return newLocal;
	}

	public takeNextCreationRange(): IdCreationRange {
		const count = this.generatedIdCount - (this.nextRangeBaseGenCount - 1);
		if (count === 0) {
			return {
				sessionId: this.localSessionId,
			};
		}
		const range: IdCreationRange = {
			sessionId: this.localSessionId,
			ids: {
				firstGenCount: this.nextRangeBaseGenCount,
				count,
			},
		};
		this.nextRangeBaseGenCount = this.generatedIdCount + 1;
		return range;
	}

	public finalizeCreationRange(range: IdCreationRange): void {
		// Check if the range has IDs
		if (range.ids === undefined) {
			return;
		} else if (range.ids.count === 0) {
			throw new Error("Malformed ID Range.");
		}

		const { sessionId, ids } = range;
		const { count, firstGenCount } = ids;
		const session = this.sessions.getOrCreate(sessionId);
		const isLocal = session === this.localSession;
		const rangeBaseLocal = localIdFromGenCount(firstGenCount);
		let tailCluster = session.getTailCluster();
		if (tailCluster === undefined) {
			// This is the first cluster in the session space
			if (rangeBaseLocal !== -1) {
				throw new Error("Ranges finalized out of order.");
			}
			tailCluster = this.addEmptyCluster(
				session,
				rangeBaseLocal,
				this.clusterCapacity + count,
			);
			if (isLocal) {
				this.logger?.sendTelemetryEvent({
					eventName: "RuntimeIdCompressor:FirstCluster",
					sessionId: this.localSessionId,
				});
			}
		}

		const remainingCapacity = tailCluster.capacity - tailCluster.count;
		if (tailCluster.baseLocalId - tailCluster.count !== rangeBaseLocal) {
			throw new Error("Ranges finalized out of order.");
		}

		if (remainingCapacity >= count) {
			// The current range fits in the existing cluster
			tailCluster.count += count;
		} else {
			const overflow = count - remainingCapacity;
			const newClaimedFinalCount = overflow + this.clusterCapacity;
			if (tailCluster === this.finalSpace.getTailCluster()) {
				// Tail cluster is the last cluster, and so can be expanded.
				tailCluster.capacity += newClaimedFinalCount;
				tailCluster.count += count;
				if (isLocal) {
					this.logger?.sendTelemetryEvent({
						eventName: "RuntimeIdCompressor:ClusterExpansion",
						sessionId: this.localSessionId,
						previousCapacity: tailCluster.capacity - newClaimedFinalCount,
						newCapacity: tailCluster.capacity,
						overflow,
					});
				}
			} else {
				// Tail cluster is not the last cluster. Fill and overflow to new.
				tailCluster.count = tailCluster.capacity;
				const newCluster = this.addEmptyCluster(
					session,
					(rangeBaseLocal - remainingCapacity) as LocalCompressedId,
					newClaimedFinalCount,
				);
				newCluster.count += overflow;
				if (isLocal) {
					this.logger?.sendTelemetryEvent({
						eventName: "RuntimeIdCompressor:NewCluster",
						sessionId: this.localSessionId,
					});
				}
			}
		}

		if (isLocal) {
			this.logger?.sendTelemetryEvent({
				eventName: "RuntimeIdCompressor:IdCompressorStatus",
				eagerFinalIdCount: this.telemetryEagerFinalIdCount,
				localIdCount: this.telemetryLocalIdCount,
				sessionId: this.localSessionId,
			});
			this.telemetryEagerFinalIdCount = 0;
			this.telemetryLocalIdCount = 0;
		}
	}

	private addEmptyCluster(
		session: Session,
		baseLocalId: LocalCompressedId,
		capacity: number,
	): IdCluster {
		const tailCluster = this.finalSpace.getTailCluster();
		const nextBaseFinal =
			tailCluster === undefined
				? (0 as FinalCompressedId)
				: (((tailCluster.baseFinalId as number) +
						tailCluster.capacity) as FinalCompressedId);
		const newCluster = session.addEmptyCluster(nextBaseFinal, baseLocalId, capacity);
		if (this.sessions.clusterCollides(session, newCluster)) {
			throw new Error("Cluster collision detected.");
		}
		this.finalSpace.addCluster(newCluster);
		return newCluster;
	}

	public normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId {
		if (isFinalId(id)) {
			return id;
		} else {
			const local = id as unknown as LocalCompressedId;
			if (!this.normalizer.contains(local)) {
				throw new Error("Invalid ID to normalize.");
			}
			const finalForm = this.localSession.tryConvertToFinal(local, true);
			return finalForm === undefined
				? (local as unknown as OpSpaceCompressedId)
				: (finalForm as OpSpaceCompressedId);
		}
	}

	public normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId {
		if (isFinalId(id)) {
			const containingCluster = this.localSession.getClusterByAllocatedFinal(id);
			if (containingCluster === undefined) {
				// Does not exist in local cluster chain
				if (id > this.finalSpace.getFinalIdLimit()) {
					// TODO: remove duplicate error strings
					throw new Error("Unknown op space ID.");
				}
				return id as unknown as SessionSpaceCompressedId;
			} else {
				const alignedLocal = getAlignedLocal(containingCluster, id);
				if (alignedLocal === undefined) {
					throw new Error("Unknown op space ID.");
				}
				if (this.normalizer.contains(alignedLocal)) {
					return alignedLocal;
				} else if (genCountFromLocalId(alignedLocal) <= this.generatedIdCount) {
					return id as unknown as SessionSpaceCompressedId;
				} else {
					throw new Error("Unknown op space ID.");
				}
			}
		} else {
			const localToNormalize = id as unknown as LocalCompressedId;
			if (originSessionId === this.localSessionId) {
				if (this.normalizer.contains(localToNormalize)) {
					return localToNormalize;
				} else if (genCountFromLocalId(localToNormalize) <= this.generatedIdCount) {
					// Id is an eager final
					const correspondingFinal = this.localSession.tryConvertToFinal(
						localToNormalize,
						true,
					);
					if (correspondingFinal === undefined) {
						throw new Error("Unknown op space ID.");
					}
					return correspondingFinal as unknown as SessionSpaceCompressedId;
				} else {
					throw new Error("Unknown op space ID.");
				}
			} else {
				// LocalId from a remote session
				const remoteSession = this.sessions.get(originSessionId);
				if (remoteSession === undefined) {
					throw new Error("No IDs have ever been finalized by the supplied session.");
				}
				const correspondingFinal = remoteSession.tryConvertToFinal(localToNormalize, false);
				if (correspondingFinal === undefined) {
					throw new Error("Unknown op space ID.");
				}
				return correspondingFinal as unknown as SessionSpaceCompressedId;
			}
		}
	}

	public decompress(id: SessionSpaceCompressedId): StableId {
		return (
			this.tryDecompress(id) ?? fail("Compressed ID was not generated by this compressor.")
		);
	}

	public tryDecompress(id: SessionSpaceCompressedId): StableId | undefined {
		if (isFinalId(id)) {
			const containingCluster = this.finalSpace.getContainingCluster(id);
			if (containingCluster === undefined) {
				return undefined;
			}
			const alignedLocal = getAlignedLocal(containingCluster, id);
			if (alignedLocal === undefined) {
				return undefined;
			}
			const alignedGenCount = genCountFromLocalId(alignedLocal);
			if (alignedLocal < lastFinalizedLocal(containingCluster)) {
				// must be an id generated (allocated or finalized) by the local session, or a finalized id from a remote session
				if (containingCluster.session === this.localSession) {
					if (this.normalizer.contains(alignedLocal)) {
						// the supplied ID was final, but was have been minted as local. the supplier should not have the ID in final form.
						return undefined;
					}
					if (alignedGenCount > this.generatedIdCount) {
						// the supplied ID was never generated
						return undefined;
					}
				} else {
					return undefined;
				}
			}

			return stableIdFromNumericUuid(
				offsetNumericUuid(containingCluster.session.sessionUuid, alignedGenCount - 1),
			);
		} else {
			const localToDecompress = id as unknown as LocalCompressedId;
			if (!this.normalizer.contains(localToDecompress)) {
				return undefined;
			}
			return stableIdFromNumericUuid(
				offsetNumericUuid(
					this.localSession.sessionUuid,
					genCountFromLocalId(localToDecompress) - 1,
				),
			);
		}
	}

	public recompress(uncompressed: StableId): SessionSpaceCompressedId {
		return this.tryRecompress(uncompressed) ?? fail("Could not recompress.");
	}

	public tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined {
		const match = this.sessions.getContainingCluster(uncompressed);
		if (match === undefined) {
			const numericUncompressed = numericUuidFromStableId(uncompressed);
			const offset = subtractNumericUuids(numericUncompressed, this.localSession.sessionUuid);
			if (offset < Number.MAX_SAFE_INTEGER) {
				const genCountEquivalent = Number(offset) + 1;
				const localEquivalent = localIdFromGenCount(genCountEquivalent);
				if (this.normalizer.contains(localEquivalent)) {
					return localEquivalent;
				}
			}
			return undefined;
		} else {
			const [containingCluster, alignedLocal] = match;
			if (containingCluster.session === this.localSession) {
				// Local session
				if (this.normalizer.contains(alignedLocal)) {
					return alignedLocal;
				} else if (genCountFromLocalId(alignedLocal) <= this.generatedIdCount) {
					// Id is an eager final
					return getAllocatedFinal(containingCluster, alignedLocal) as
						| SessionSpaceCompressedId
						| undefined;
				} else {
					return undefined;
				}
			} else {
				// Not the local session
				return genCountFromLocalId(alignedLocal) >= lastFinalizedLocal(containingCluster)
					? (getAllocatedFinal(containingCluster, alignedLocal) as
							| SessionSpaceCompressedId
							| undefined)
					: undefined;
			}
		}
	}

	public serialize(withSession: true): SerializedIdCompressorWithOngoingSession;
	public serialize(withSession: false): SerializedIdCompressorWithNoSession;
	public serialize(withSession: boolean): SerializedIdCompressor {
		const { normalizer, finalSpace, sessions } = this;
		// The local state, if present, is split into two chunks (with sessions serialized in between) to make
		// deserialization easier. This is done to make using constructor calls easier and avoid making
		// fields mutable.
		const localStateFirstChunk = withSession
			? 16 // local uuid
			: 0;
		const localStateSecondChunk = withSession
			? 8 + // generated ID count
			  8 + // next range base genCount
			  8 + // count of normalizer pairs
			  this.normalizer.contents.size * 16 // pairs
			: 0;
		// The only empty session (if there is one) will be the local session.
		// When serializing without local state, we omit it to avoid accumulating empty sessions.
		// We must also reduce the session count by 1 and adjust all cluster session indexes by 1.
		const indexOffset = !withSession && this.generatedIdCount === 0 ? 1 : 0;
		const sessionCount = sessions.sessions.length - indexOffset;
		const totalByteSize =
			8 + // version
			1 + // hasLocalState
			localStateFirstChunk + // local uuid
			8 + // session count
			sessionCount * 16 + // session IDs
			localStateSecondChunk + // remainder of local state
			8 + // cluster capacity
			8 + // cluster count
			finalSpace.clusters.length * 8 * 3; // clusters: (sessionIndex, capacity, count)[]
		// Layout
		const serialized = new Uint8Array(totalByteSize);

		let index = 0;
		index = writeNumber(serialized, index, currentWrittenVersion);
		index = writeBoolean(serialized, index, withSession);

		if (withSession) {
			index = writeNumericUuid(serialized, index, this.localSession.sessionUuid);
		}

		index = writeNumber(serialized, index, sessionCount);
		const sessionIndexMap = new Map<Session, number>();
		for (let i = indexOffset; i < sessions.sessions.length; i++) {
			const session = sessions.sessions[i];
			assert(
				!session.isEmpty() || session === this.localSession,
				"Empty sessions must not be serialized.",
			);
			index = writeNumericUuid(serialized, index, session.sessionUuid);
			sessionIndexMap.set(session, i - indexOffset);
		}

		if (withSession) {
			index = writeNumber(serialized, index, this.generatedIdCount);
			index = writeNumber(serialized, index, this.nextRangeBaseGenCount);
			index = writeNumber(serialized, index, normalizer.contents.size);
			for (const [leadingLocal, count] of normalizer.contents.entries()) {
				index = writeNumber(serialized, index, genCountFromLocalId(leadingLocal));
				index = writeNumber(serialized, index, count);
			}
		}

		index = writeNumber(serialized, index, this.clusterCapacity);
		index = writeNumber(serialized, index, finalSpace.clusters.length);
		finalSpace.clusters.forEach((cluster) => {
			index = writeNumber(serialized, index, sessionIndexMap.get(cluster.session) as number);
			index = writeNumber(serialized, index, cluster.capacity);
			index = writeNumber(serialized, index, cluster.count);
		});

		this.logger?.sendTelemetryEvent({
			eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
			size: serialized.byteLength,
			clusterCount: finalSpace.clusters.length,
			sessionCount: sessions.sessions.length,
		});

		return { bytes: serialized } as unknown as SerializedIdCompressor;
	}

	public static deserialize(serialized: SerializedIdCompressorWithOngoingSession): IdCompressor;
	public static deserialize(
		serialized: SerializedIdCompressorWithNoSession,
		newSessionId: SessionId,
	): IdCompressor;
	public static deserialize(
		serialized: SerializedIdCompressor,
		sessionId?: SessionId,
	): IdCompressor {
		const index = { index: 0, bytes: serialized.bytes };
		const version = readNumber(index);
		assert(version === currentWrittenVersion, "Unknown serialized version.");

		const hasLocalState = readBoolean(index);
		let localSessionUuid: NumericUuid;
		// Local session ID
		if (hasLocalState) {
			assert(sessionId === undefined, "Local state should not exist in serialized form.");
			localSessionUuid = readNumericUuid(index);
		} else {
			assert(sessionId !== undefined, "Local state should exist in serialized form.");
			localSessionUuid = numericUuidFromStableId(sessionId);
		}

		// Sessions
		const sessionCount = readNumber(index);
		const sessions: [NumericUuid, Session][] = hasLocalState
			? []
			: [[localSessionUuid, new Session(localSessionUuid)]];
		const sessionIndexOffset = hasLocalState ? 0 : 1;
		for (let i = 0; i < sessionCount; i++) {
			const numeric = readNumericUuid(index);
			sessions.push([numeric, new Session(numeric)]);
		}
		const compressor = new IdCompressor({
			sessions: new Sessions(sessions),
			localSessionId: stableIdFromNumericUuid(localSessionUuid) as SessionId,
		});

		// Remainder of local state
		if (hasLocalState) {
			assert(sessionId === undefined, "Local state should not exist in serialized form.");
			compressor.generatedIdCount = readNumber(index);
			compressor.nextRangeBaseGenCount = readNumber(index);
			const normalizerCount = readNumber(index);
			for (let i = 0; i < normalizerCount; i++) {
				compressor.normalizer.addLocalRange(
					localIdFromGenCount(readNumber(index)),
					readNumber(index),
				);
			}
		} else {
			assert(sessionId !== undefined, "Local state should exist in serialized form.");
		}

		// Clusters
		compressor.clusterCapacity = readNumber(index);
		const clusterCount = readNumber(index);
		let baseFinalId = 0;
		for (let i = 0; i < clusterCount; i++) {
			const sessionIndex = readNumber(index);
			const session = sessions[sessionIndex + sessionIndexOffset][1];
			const tailCluster = session.getTailCluster();
			const baseLocalId =
				tailCluster === undefined ? -1 : lastAllocatedLocal(tailCluster) - 1;
			const capacity = readNumber(index);
			const count = readNumber(index);
			const cluster = session.addEmptyCluster(
				baseFinalId as FinalCompressedId,
				baseLocalId as LocalCompressedId,
				capacity,
			);
			cluster.count = count;
			compressor.finalSpace.addCluster(cluster);
			baseFinalId += capacity;
		}

		return compressor;
	}

	public equals(other: IdCompressor, includeLocalState: boolean): boolean {
		if (
			includeLocalState &&
			(this.localSessionId !== other.localSessionId ||
				!this.localSession.equals(other.localSession) ||
				!this.normalizer.equals(other.normalizer) ||
				this.nextRangeBaseGenCount !== other.nextRangeBaseGenCount ||
				this.generatedIdCount !== other.generatedIdCount)
		) {
			return false;
		}
		return (
			this.newClusterCapacity === other.newClusterCapacity &&
			this.sessions.equals(other.sessions, includeLocalState) &&
			this.finalSpace.equals(other.finalSpace)
		);
	}
}
