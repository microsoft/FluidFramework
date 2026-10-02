/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "./identifiers.js";
import type {
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "./persisted-types/index.js";

/**
 * Serialization format versions for IdCompressor.
 * @internal
 */
export const SerializationVersion = {
	/**
	 * Base format without sharding support
	 */
	V2: 2,
	/**
	 * Adds optional sharding state
	 */
	V3: 3,
} as const;

/**
 * Type representing valid serialization version values.
 * @internal
 */
export type SerializationVersion =
	(typeof SerializationVersion)[keyof typeof SerializationVersion];

/**
 * A distributed UUID generator and compressor.
 *
 * Generates arbitrary non-colliding v4 UUIDs, called stable IDs, for multiple "sessions" (which can be distributed across the network),
 * providing each session with the ability to map these UUIDs to `numbers`.
 *
 * A session is a unique identifier that denotes a single compressor. New IDs are created through a single compressor API
 * which should then be sent in ranges to the server for total ordering (and are subsequently relayed to other clients). When a new ID is
 * created it is said to be created by the compressor's "local" session.
 *
 * For each stable ID created, two numeric IDs are provided by the compressor:
 *
 * 1. A session-local ID, which is stable for the lifetime of the session (which could be longer than that of the compressor object, as it may
 * be serialized for offline usage). Available as soon as the stable ID is allocated. These IDs are session-unique and are thus only
 * safely usable within the scope of the compressor that created it.
 *
 * 2. A final ID, which is stable across serialization and deserialization of an IdCompressor. Available as soon as the range containing
 * the corresponding session-local ID is totally ordered (via consensus) with respect to other sessions' allocations.
 * Final IDs are known to and publicly usable by any compressor that has received them.
 *
 * Compressors will allocate UUIDs in non-random ways to reduce entropy allowing for optimized storage of the data needed
 * to map the UUIDs to the numbers.
 *
 * The following invariants are upheld by IdCompressor:
 *
 * 1. Session-local IDs will always decompress to the same UUIDs for the lifetime of the session.
 *
 * 2. Final IDs will always decompress to the same UUIDs.
 *
 * 3. After a server-processed range of session-local IDs (from any session) is received by a compressor, any of those session-local IDs may be
 * translated by the compressor into the corresponding final ID. For any given session-local ID, this translation will always yield the
 * same final ID.
 *
 * 4. A UUID will always compress into the same session-local ID for the lifetime of the session.
 *
 * Session-local IDs are sent across the wire in efficiently-represented ranges. These ranges are created by querying the compressor, and *must*
 * be ordered (i.e. sent to the server) in the order they are created in order to preserve the above invariants.
 *
 * Session-local IDs can be used immediately after creation, but will eventually (after being sequenced) have a corresponding final ID. This
 * could make reasoning about equality of those two forms difficult. For example, if a cache is keyed off of a
 * session-local ID but is later queried using the final ID (which is semantically equal, as it decompresses to the same UUID/string) it will
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
 * out of Op space over time, namely, when a session-local ID in this space becomes finalized, and thereafter has a "more final form".
 * Consequentially, it may be useful to restrict parameters of a persisted type to this space (to optimize perf), but it is potentially
 * incorrect to use this type for a runtime variable. This is an asymmetry that does not affect session space, as local IDs are always as
 * "local as possible".
 *
 * These two spaces naturally define a rule: consumers of compressed IDs should use session-space IDs, but serialized forms such as ops
 * should use op-space IDs.
 *
 * @internal
 */
export interface IIdCompressorCore {
	/**
	 * Returns a range of IDs created by this session in a format for sending to the server for finalizing.
	 * The range will include all IDs generated via calls to `generateCompressedId` since the last time a
	 * range was taken (via this method or `takeUnfinalizedCreationRange`).
	 * @returns the range of IDs, which may be empty. This range must be sent to the server for ordering before
	 * it is finalized. Ranges must be sent to the server in the order that they are taken via calls to this method.
	 * @throws if called on a child (non-root) shard. All shards in a shard tree share a single session, and only
	 * the root shard may finalize that session's IDs with the server; a child's IDs are instead reconciled with the
	 * root via {@link IIdCompressorCore.synchronizeWithShard} / {@link IIdCompressorCore.disposeShard}.
	 */
	takeNextCreationRange(): IdCreationRange;

	/**
	 * Returns a range of IDs created by this session in a format for sending to the server for finalizing.
	 * The range will include all unfinalized IDs generated via calls to `generateCompressedId`.
	 * @returns the range of IDs, which may be empty. This range must be sent to the server for ordering before
	 * it is finalized. Ranges must be sent to the server in the order that they are taken via calls to this method.
	 * Note: after finalizing the range returned by this method, finalizing any ranges that had been previously taken
	 * will result in an error.
	 */
	takeUnfinalizedCreationRange(): IdCreationRange;

	/**
	 * Resets the next creation range to include all unfinalized IDs.
	 *
	 * @remarks
	 * IMPORTANT: This must only be called if it's CERTAIN that the unfinalized range will never be finalized as-is (e.g. by in-flight ops).
	 *
	 * After calling this, the next call to {@link IIdCompressorCore.takeNextCreationRange} will produce a range
	 * covering all unfinalized IDs (equivalent to what {@link IIdCompressorCore.takeUnfinalizedCreationRange} would
	 * have returned) plus any IDs generated after this call.
	 *
	 * Unlike {@link IIdCompressorCore.takeUnfinalizedCreationRange}, this method does not produce or return a range,
	 * and does not advance the internal range counter. It is useful when the caller wants to
	 * defer the actual range submission to the next natural {@link IIdCompressorCore.takeNextCreationRange} call.
	 */
	resetUnfinalizedCreationRange(): void;

	/**
	 * Finalizes the supplied range of IDs (which may be from either a remote or local session).
	 * @param range - the range of session-local IDs to finalize.
	 */
	finalizeCreationRange(range: IdCreationRange): void;

	/**
	 * Run a callback that is performed from the perspective of a special "ghost" session.
	 * Any ids generated by this session will be immediately finalized on the local client as if
	 * they were created by a remote client with `ghostSessionId`.
	 *
	 * *WARNING:* This API requires an external consensus mechanism to safely use:
	 * In an attached container (i.e. multiple clients may have the document loaded), all clients must guarantee that:
	 * - They invoke this API starting from the same finalized creation ranges
	 * - This API is invoked with the same ghost session id
	 * - `ghostSessionCallback` deterministically mints the same number of ids on each client within the ghost session
	 * Failure to meet these requirements will result in divergence across clients and eventual consistency errors.
	 * While the ghost session callback is running, IdCompressor does not support serialization.
	 * @remarks This API is primarily intended for data migration scenarios which are able to deterministically transform
	 * data in some format into data in a new format.
	 * The first requirement (that all clients must invoke the API with the same finalized creation ranges) is guaranteed
	 * for this scenario because the data transformation callback occurs at a specific ack within the op stream on all
	 * clients, and clients don't finalize creation ranges for local changes they might have at this point in time.
	 * @param ghostSessionId - The session id that minted ids generated within `ghostSessionCallback` should be attributed to.
	 * @param ghostSessionCallback - Callback which mints ids attributed to the ghost session.
	 */
	beginGhostSession(ghostSessionId: SessionId, ghostSessionCallback: () => void): void;

	/**
	 * Shards the ID space of this compressor such that multiple local compressors can safely share it without colliding.
	 * This can allow multiple local instantiations of the same compressor to safely share an ID space in scenarios where
	 * different threads do not have access to a central ID compressor.
	 * @param newShardCount - The number of additional different shards to split this compressor into.
	 * Must be a positive safe integer.
	 * @throws If `newShardCount` is not a positive safe integer or the resulting stride exceeds the sharding limit.
	 * @returns An array of serialized compressors of size `newShardCount`.
	 * These can be passed across a marshalling boundary and rehydrated on the other side, and will safely share the ID space of `this`.
	 * Note that this method should only be needed when multiple JS runtimes are in play, as sharded compressors essentially
	 * attempt to emulate a single static compressor and any code running in the same JS runtime can simply use statics.
	 */
	shard(newShardCount: number): SerializedIdCompressorWithOngoingSession[];

	/**
	 * Synchronizes `this` compressor with a child shard. Synchronization will occur for the state of the child at the time `syncToken`
	 * was generated, meaning that `this` compressor can use/ingest IDs generated up to that point. Attempts to use IDs from a child shard
	 * without first synchronizing will result in an exception.
	 *
	 * If `syncToken` is a disposal token (its {@link ShardToken.disposed} flag is `true`, as produced by
	 * {@link IIdCompressorCore.disposeShard}), this additionally deregisters the child shard and reclaims its subset of the ID space
	 * into `this`. Once a shard has been disposed it is no longer safe to use the compressor the token came from, and a shard tree must
	 * be disposed from the leaves upwards.
	 * @param syncToken - The token for the shard, obtained by calling {@link IIdCompressorCore.getShardSyncToken} (non-destructive
	 * synchronization) or {@link IIdCompressorCore.disposeShard} (synchronization plus reclamation of the disposed shard's ID space).
	 */
	synchronizeWithShard(syncToken: ShardSynchronizationToken): void;

	/**
	 * Returns undefined if this compressor is not part of a shard group, and otherwise returns a synchronization token for this shard
	 * that can be used when calling {@link IIdCompressorCore.synchronizeWithShard}. This does NOT dispose the shard.
	 *
	 * @returns The sync token if this compressor is part of a sharded group, otherwise undefined.
	 * The returned token is serializable and can be passed across marshaling boundaries. This token can be used to synchronize a
	 * parent with this compressor by calling {@link IIdCompressorCore.synchronizeWithShard}.
	 * Unlike {@link IIdCompressorCore.disposeShard}, this is non-destructive and may be called on a shard that still has active
	 * child shards, which allows an intermediate shard to propagate its progress upward to its own parent.
	 * @throws If this compressor is the root of the shard tree (only non-root shards can produce a token).
	 */
	getShardSyncToken(): ShardSynchronizationToken | undefined;

	/**
	 * Returns undefined if this compressor is not part of a shard group, and otherwise disposes this shard and returns
	 * the disposal token for this compressor. If this compressor was part of a shard group, the compressor will no longer be usable.
	 *
	 * @returns The disposal token if this compressor is part of a sharded group, otherwise undefined.
	 * The returned token is serializable and can be passed across marshaling boundaries. Passing it to
	 * {@link IIdCompressorCore.synchronizeWithShard} on the parent reclaims this shard's subset of the ID space.
	 * @throws If this shard has active child shards.
	 * This means that a shard tree must be disposed from the leaves upwards.
	 */
	disposeShard(): ShardSynchronizationToken | undefined;

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `deserializeIdCompressor()`.
	 * This includes finalized state as well as un-finalized state and is therefore suitable for use in offline scenarios.
	 */
	serialize(withSession: true): SerializedIdCompressorWithOngoingSession;

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `deserializeIdCompressor()`.
	 * This only includes finalized state and is therefore suitable for use in summaries.
	 */
	serialize(withSession: false): SerializedIdCompressorWithNoSession;
}

/**
 * The state shared by all shard tokens: enough information to identify a shard and its progress
 * through its stride pattern. This is used to track which shard generated which IDs and to manage
 * reclamation of a disposed shard's ID space. The {@link ShardToken.disposed} flag distinguishes a
 * plain synchronization token from a disposal token. The branded {@link ShardSynchronizationToken}
 * is the concrete type handed to consumers.
 * @internal
 */
export interface ShardToken {
	/**
	 * The number of positions filled in this shard's stride pattern.
	 * This tracks progress through the stride cycle, not the count of IDs actually generated.
	 * For example, when a shard is created, it backfills entries for positions in its stride,
	 * so this value may be non-zero even if the shard hasn't generated any IDs yet.
	 */
	localGenCount: number;

	/**
	 * Unique identifier for this shard within its parent.
	 */
	shardId: SessionId;

	/**
	 * Whether this token also signals disposal of the originating shard. When `true`, passing the token to
	 * {@link IIdCompressorCore.synchronizeWithShard} reclaims the shard's ID space in addition to synchronizing.
	 * Produced as `false` by {@link IIdCompressorCore.getShardSyncToken} and `true` by {@link IIdCompressorCore.disposeShard}.
	 */
	disposed: boolean;
}

/**
 * A {@link ShardToken} that identifies a shard for synchronization (and, when {@link ShardToken.disposed} is `true`,
 * reclamation) via {@link IIdCompressorCore.synchronizeWithShard}.
 * @internal
 */
export type ShardSynchronizationToken = ShardToken & {
	readonly ShardSynchronizationToken: "c79724e1-9103-4415-95b5-bebb932be404";
};

/**
 * Generates stable identifiers and compresses them for efficient storage and transmission.
 *
 * @remarks
 * A stable identifier is a version 4 universally unique identifier (UUID).
 * An ID compressor represents a stable identifier as a small integer when possible.
 * You can use {@link IIdCompressor.decompress} to retrieve the stable identifier from its compressed form.
 *
 * Each ID compressor has a local session.
 * Multiple sessions can generate IDs at the same time without generating the same stable identifier.
 * In Fluid Framework, a session has the same scope as a container.
 *
 * A compressed ID exists in one of two spaces:
 *
 * - Session space is the local session in which you use an ID.
 * An ID in session space remains equal for the lifetime of that session.
 * - Operation space is the context in which you serialize an ID, such as in an operation or a summary.
 *
 * {@link IIdCompressor.generateCompressedId} returns an ID in session space.
 * Do not serialize that ID directly.
 * Before you serialize it, use {@link IIdCompressor.normalizeToOpSpace} to convert it to operation space.
 * When you receive the serialized ID, use {@link IIdCompressor.normalizeToSessionSpace} to convert it to your session space.
 *
 * @example Send an ID to another client
 * ```typescript
 * // Client A converts a new ID to operation space and sends its local session ID.
 * const message = {
 * 	sessionId: clientAIdCompressor.localSessionId,
 * 	id: clientAIdCompressor.normalizeToOpSpace(
 * 		clientAIdCompressor.generateCompressedId(),
 * 	),
 * };
 *
 * // Client B converts the received ID to its own session space before it uses the ID.
 * const sessionSpaceId = clientBIdCompressor.normalizeToSessionSpace(
 * 	message.id,
 * 	message.sessionId,
 * );
 * ```
 *
 * @public
 * @sealed
 */
export interface IIdCompressor {
	/**
	 * The identifier for the local session.
	 */
	localSessionId: SessionId;

	/**
	 * Generates a compressed ID in the local session.
	 *
	 * @returns A new ID in session space.
	 * Do not serialize this ID directly.
	 * Use {@link IIdCompressor.normalizeToOpSpace} to convert it to operation space before serialization.
	 */
	generateCompressedId(): SessionSpaceCompressedId;

	/**
	 * Generates an ID that does not require normalization before serialization.
	 *
	 * @remarks
	 * The ID is unique across all sessions known to this compressor.
	 * The result can be a compressed ID or a stable identifier.
	 * A stable identifier is a universally unique identifier (UUID) string and requires more storage than a compressed ID.
	 * The compressor is more likely to return a stable identifier when it cannot communicate with the Fluid service, such as when it is offline.
	 *
	 * Use {@link IIdCompressor.generateCompressedId} instead if the ID must be a small integer.
	 *
	 * @returns A new ID that is valid in both session space and operation space, or a stable identifier.
	 */
	generateDocumentUniqueId(): (SessionSpaceCompressedId & OpSpaceCompressedId) | StableId;

	/**
	 * Converts an ID from session space to operation space.
	 *
	 * @param id - The local ID to normalize.
	 * @returns The ID in operation space.
	 * You can serialize this ID.
	 * Convert it back to session space with {@link IIdCompressor.normalizeToSessionSpace} before you use it.
	 */
	normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId;

	/**
	 * Converts an ID from operation space to the local session space.
	 *
	 * @remarks
	 * `originSessionId` must identify the compressor that converted `id` to operation space.
	 * That compressor can be different from the compressor that first generated the ID.
	 * For example, one client can serialize a reference to an ID that another client generated.
	 *
	 * This compressor must also know the applicable {@link IdCreationRange} from the compressor that serialized the ID.
	 * You can provide the range information when you create this compressor with {@link (deserializeIdCompressor:1)}.
	 * Alternatively, you can use a system that synchronizes the range information.
	 * The Fluid Framework runtime automatically synchronizes ID creation ranges from other clients in the container.
	 *
	 * You must preserve the session ID of the compressor that serialized the operation-space ID.
	 * You can get this session ID from the operation metadata or store it with the serialized data.
	 *
	 * An attachment summary is an operation, but clients can also process it as a summary without its originating session.
	 * If an attachment summary contains an operation-space ID, store the applicable session ID in the summary.
	 * Use the same method for regular summaries and exported data.
	 *
	 * @param id - The ID in operation space.
	 * @param originSessionId - The {@link IIdCompressor.localSessionId} of the compressor that converted `id` to operation space.
	 * @returns The corresponding ID in the local session space.
	 */
	normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId;

	/**
	 * Tries to convert an ID from operation space to session space without the originating session ID.
	 *
	 * @remarks
	 * Use this method only to recover data for which the originating session ID is not available.
	 * When the session ID is available, use {@link IIdCompressor.normalizeToSessionSpace}.
	 *
	 * A final ID does not require the originating session ID.
	 * If `id` is final and valid for this compressor, this method returns the corresponding session-space ID.
	 * A non-final ID is local to its originating session and cannot be converted without that session ID.
	 *
	 * @param id - The ID in operation space.
	 * @returns The corresponding ID in session space, or `undefined` if `id` is non-final.
	 * @throws An error if `id` is final but this compressor has not observed it as finalized.
	 * Do not use this error to validate an ID.
	 * A finalized ID from a different compressor can pass this check and produce an incorrect session-space ID.
	 *
	 * @privateRemarks
	 * This method currently supports data recovery when session IDs are lost.
	 * A future API could report whether encoded data contains non-final IDs and therefore requires a session ID.
	 * In that case, this method or a version of `normalizeToSessionSpace` with an optional session ID could support uses other than recovery.
	 */
	tryNormalizeToSessionSpaceWithoutSession(
		id: OpSpaceCompressedId,
	): SessionSpaceCompressedId | undefined;

	/**
	 * Decompresses an ID into its stable identifier.
	 *
	 * @param id - The compressed ID.
	 * @returns The stable identifier associated with `id`.
	 * A stable identifier is a universally unique identifier (UUID) string.
	 * @throws An error if a session known to this compressor did not generate `id`.
	 */
	decompress(id: SessionSpaceCompressedId): StableId;

	/**
	 * Compresses a stable identifier.
	 *
	 * @param uncompressed - The stable identifier to compress.
	 * A stable identifier is a universally unique identifier (UUID) string.
	 * @returns The session-space ID associated with `uncompressed`.
	 * @throws An error if a session known to this compressor did not generate `uncompressed`.
	 */
	recompress(uncompressed: StableId): SessionSpaceCompressedId;

	/**
	 * Tries to compress a stable identifier.
	 *
	 * @param uncompressed - The stable identifier to compress.
	 * A stable identifier is a universally unique identifier (UUID) string.
	 * @returns The session-space ID associated with `uncompressed`, or `undefined` if a session known to this compressor did not generate it.
	 */
	tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined;
}
