/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
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
	initialClusterCapacity,
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
	stableIdFromNumericUuid,
	subtractNumericUuids,
	fail,
} from "./utilities";
import {
	Index,
	readBoolean,
	readNumber,
	readNumericUuid,
	writeBoolean,
	writeNumber,
	writeNumericUuid,
} from "./persistanceUtilities";
import {
	getAlignedLocal,
	getAlignedFinal,
	IdCluster,
	lastAllocatedLocal,
	lastFinalizedLocal,
	Session,
	Sessions,
} from "./sessions";
import { SessionSpaceNormalizer } from "./sessionSpaceNormalizer";
import { FinalSpace } from "./finalSpace";

/**
 * The version of IdCompressor that is currently persisted.
 * This should not be changed without careful consideration to compatibility.
 */
const currentWrittenVersion = 1;

/**
 * See {@link IIdCompressor} and {@link IIdCompressorCore}
 */
export class IdCompressor implements IIdCompressor, IIdCompressorCore {
	/**
	 * Max allowed initial cluster size.
	 */
	public static readonly maxClusterSize = 2 ** 20;

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
		this.newClusterCapacity = initialClusterCapacity;
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

		assert(!session.isEmpty(), "Empty sessions should not be created.");
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
					return getAlignedFinal(containingCluster, alignedLocal) as
						| SessionSpaceCompressedId
						| undefined;
				} else {
					return undefined;
				}
			} else {
				// Not the local session
				return genCountFromLocalId(alignedLocal) >= lastFinalizedLocal(containingCluster)
					? (getAlignedFinal(containingCluster, alignedLocal) as
							| SessionSpaceCompressedId
							| undefined)
					: undefined;
			}
		}
	}

	public serialize(withSession: true): SerializedIdCompressorWithOngoingSession;
	public serialize(withSession: false): SerializedIdCompressorWithNoSession;
	public serialize(hasLocalState: boolean): SerializedIdCompressor {
		const { normalizer, finalSpace, sessions } = this;
		const serializedSessions: Session[] = [];
		for (const session of sessions.sessions()) {
			// Filter empty sessions to prevent them accumulating in the serialized state.
			// This can only happen via serializing with local state repeatedly.
			if (!session.isEmpty() || (hasLocalState && session === this.localSession)) {
				serializedSessions.push(session);
			}
		}
		const localStateSize = hasLocalState
			? 1 + // generated ID count
			  1 + // next range base genCount
			  1 + // count of normalizer pairs
			  this.normalizer.contents.size * 2 // pairs
			: 0;
		// Layout size, in 8 byte increments
		const totalSize =
			1 + // version
			1 + // hasLocalState
			1 + // cluster capacity
			1 + // session count
			1 + // cluster count
			serializedSessions.length * 2 + // session IDs
			finalSpace.clusters.length * 3 + // clusters: (sessionIndex, capacity, count)[]
			localStateSize; // local state, if present

		const serializedFloat = new Float64Array(totalSize);
		const serializedUint = new BigUint64Array(serializedFloat.buffer);
		let index = 0;
		index = writeNumber(serializedFloat, index, currentWrittenVersion);
		index = writeBoolean(serializedFloat, index, hasLocalState);
		index = writeNumber(serializedFloat, index, this.clusterCapacity);
		index = writeNumber(serializedFloat, index, serializedSessions.length);
		index = writeNumber(serializedFloat, index, finalSpace.clusters.length);

		const sessionIndexMap = new Map<Session, number>();
		for (let i = 0; i < serializedSessions.length; i++) {
			const session = serializedSessions[i];
			index = writeNumericUuid(serializedUint, index, session.sessionUuid);
			sessionIndexMap.set(session, i);
		}

		finalSpace.clusters.forEach((cluster) => {
			index = writeNumber(
				serializedFloat,
				index,
				sessionIndexMap.get(cluster.session) as number,
			);
			index = writeNumber(serializedFloat, index, cluster.capacity);
			index = writeNumber(serializedFloat, index, cluster.count);
		});

		if (hasLocalState) {
			index = writeNumber(serializedFloat, index, this.generatedIdCount);
			index = writeNumber(serializedFloat, index, this.nextRangeBaseGenCount);
			index = writeNumber(serializedFloat, index, normalizer.contents.size);
			for (const [leadingLocal, count] of normalizer.contents.entries()) {
				index = writeNumber(serializedFloat, index, genCountFromLocalId(leadingLocal));
				index = writeNumber(serializedFloat, index, count);
			}
		}

		assert(index === totalSize, "Serialized size was incorrectly calculated.");
		this.logger?.sendTelemetryEvent({
			eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
			size: serializedFloat.byteLength,
			clusterCount: finalSpace.clusters.length,
			sessionCount: serializedSessions.length,
		});

		return bufferToString(serializedFloat.buffer, "base64") as SerializedIdCompressor;
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
		const buffer = stringToBuffer(serialized, "base64");
		const index: Index = {
			index: 0,
			bufferFloat: new Float64Array(buffer),
			bufferUint: new BigUint64Array(buffer),
		};
		const version = readNumber(index);
		assert(version === currentWrittenVersion, "Unknown serialized version.");
		const hasLocalState = readBoolean(index);
		const clusterCapacity = readNumber(index);
		const sessionCount = readNumber(index);
		const clusterCount = readNumber(index);

		// Sessions
		let sessionOffset: number;
		let sessions: [NumericUuid, Session][];
		if (hasLocalState) {
			sessionOffset = 0;
			sessions = [];
		} else {
			// If !hasLocalState, there won't be a serialized local session ID so insert one at the beginning
			assert(sessionId !== undefined, "Local session ID is undefined.");
			const localSessionNumeric = numericUuidFromStableId(sessionId);
			sessions = [[localSessionNumeric, new Session(localSessionNumeric)]];
			sessionOffset = 1;
		}
		for (let i = 0; i < sessionCount; i++) {
			const numeric = readNumericUuid(index);
			sessions.push([numeric, new Session(numeric)]);
		}

		const compressor = new IdCompressor({
			sessions: new Sessions(sessions),
			localSessionId: stableIdFromNumericUuid(sessions[0][0]) as SessionId,
		});
		compressor.clusterCapacity = clusterCapacity;

		// Clusters
		let baseFinalId = 0;
		for (let i = 0; i < clusterCount; i++) {
			const sessionIndex = readNumber(index);
			const session = sessions[sessionIndex + sessionOffset][1];
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

		// Local state
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

		assert(
			index.index === index.bufferFloat.length,
			"Failed to read entire serialized compressor.",
		);
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
