/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SessionSpaceCompressedId,
	OpSpaceCompressedId,
	SessionId,
	StableId,
} from "./identifiers.js";
import {
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "./persisted-types/index.js";

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
 * @alpha
 */
export interface IIdCompressorCore {
	/**
	 * Returns a range of IDs created by this session in a format for sending to the server for finalizing.
	 * The range will include all IDs generated via calls to `generateCompressedId` since the last time this method was called.
	 * @returns the range of IDs, which may be empty. This range must be sent to the server for ordering before
	 * it is finalized. Ranges must be sent to the server in the order that they are taken via calls to this method.
	 */
	takeNextCreationRange(): IdCreationRange;

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
	 * Failure to meet these requirement will result in divergence across clients and eventual consistency errors.
	 * While the ghost sesion callback is running, IdCompressor does not support serialization.
	 * @remarks This API is primarily intended for data migration scenarios which are able to deterministically transform
	 * data in some format into data in a new format.
	 * The first requirement (that all clients must invoke the API with the same finalized creation ranges) is guaranteed
	 * for this scenario because the data transformation callback occurs at a specific ack within the op stream on all
	 * clients, and clients don't finalize creation ranges for local changes they might have at this point in time.
	 * @param ghostSessionId - The session id that minted ids generated within `ghostSessionCallback` should be attributed to.
	 * @param ghostSessionCallback - Callback which mints ids attributed to the ghost session.
	 */
	beginGhostSession(ghostSessionId: SessionId, ghostSessionCallback: () => void);

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 * This includes finalized state as well as un-finalized state and is therefore suitable for use in offline scenarios.
	 */
	serialize(withSession: true): SerializedIdCompressorWithOngoingSession;

	/**
	 * Returns a persistable form of the current state of this `IdCompressor` which can be rehydrated via `IdCompressor.deserialize()`.
	 * This only includes finalized state and is therefore suitable for use in summaries.
	 */
	serialize(withSession: false): SerializedIdCompressorWithNoSession;
}

/**
 * A distributed UUID generator and compressor.
 * `IdCompressor` offers the ability to generate arbitrary non-colliding v4 UUIDs, called stable IDs, while compressing them into small integers
 * for efficient storage and transmission. It also provides the ability to decompress these integers back into their original UUIDs.
 *
 * The compressor is designed to be used in a distributed environment, where multiple clients may be generating IDs concurrently.
 * IDs generated by a compressor, via calls to `generateCompressedId`, are created in the compressor's "local" session.
 * These IDs are unique within the session, but may not be unique across sessions. In the context of Fluid, the scope of a session
 * is the same as the scope of a container. This means that anytime IDs are transferred between sessions, they must be translated
 * through a process called "normalization":
 * - The scope of a local session (in which local IDs are unique) is called the "session space" of the client.
 * - The context of persisted state (in Fluid, this is the context of ops and summaries) is called "op space".
 * - `SessionSpaceCompressedId`s, generated via calls to `generateCompressedId`, should NEVER be serialized directly.
 * In Fluid, this means they should not be included in ops or summaries.
 * - Before serialization, IDs must be normalized to op space to ensure they are interpretable by other clients.
 * - Upon receipt, IDs should be normalized back to session space before use.
 *
 * Example Usage:
 *
 * ### Client A (Sender)
 *
 * ```typescript
 * // Generate several local IDs
 * const localId1 = idCompressor.generateCompressedId();
 * const localId2 = idCompressor.generateCompressedId();
 * const localId3 = idCompressor.generateCompressedId();
 *
 * // Normalize these IDs to op space for inclusion in a message
 * const opSpaceId1 = idCompressor.normalizeToOpSpace(localId1);
 * const opSpaceId2 = idCompressor.normalizeToOpSpace(localId2);
 * const opSpaceId3 = idCompressor.normalizeToOpSpace(localId3);
 *
 * // Create and send a message containing these op space IDs along with the sender's session ID
 * // In Fluid, this would be an op or summary
 * const message = {
 *     sessionID: idCompressor.localSessionId,
 *     ids: [opSpaceId1, opSpaceId2, opSpaceId3]
 * };
 * ```
 *
 * ### Client B (Receiver)
 *
 * ```typescript
 * // Receive the message from Client A
 * const receivedMessage = ...; // In Fluid, this would be an op or summary
 *
 * // Normalize the received IDs back to session space, utilizing the sender's session ID
 * const sessionSpaceId1 = idCompressor.normalizeToSessionSpace(receivedMessage.ids[0], receivedMessage.sessionID);
 * const sessionSpaceId2 = idCompressor.normalizeToSessionSpace(receivedMessage.ids[1], receivedMessage.sessionID);
 * const sessionSpaceId3 = idCompressor.normalizeToSessionSpace(receivedMessage.ids[2], receivedMessage.sessionID);
 * ```
 * @public
 */
export interface IIdCompressor {
	/**
	 * The local session ID.
	 */
	localSessionId: SessionId;

	/**
	 * Generates a new compressed ID.
	 * The returned ID is in session space and should not be serialized directly. See `IIdCompressor` for more details.
	 * @returns A new local ID in session space.
	 */
	generateCompressedId(): SessionSpaceCompressedId;

	/**
	 * Generates a new ID that is guaranteed to be unique across all sessions known to this compressor without the need for any
	 * normalization. The returned ID is not guaranteed to be a compressed ID (small number); it may be a stable ID (UUID string).
	 * In Fluid, the likelihood of generating the bulkier stable ID is dictated by network conditions and is highly probably in
	 * scenarios such as offline. This is still useful for use cases where simplicity is more important than performance and
	 * this approach will often be superior to generating a UUID.
	 * If small numbers are a requirement, `generateCompressedId` and normalization should be used instead.
	 * See `IIdCompressor` for more details.
	 * @returns A new local ID in session space.
	 */
	generateDocumentUniqueId(): (SessionSpaceCompressedId & OpSpaceCompressedId) | StableId;

	/**
	 * Normalizes a session space ID into op space.
	 * The returned ID is in op space and can be safely serialized. However, it should be normalized back to session space before use.
	 * See `IIdCompressor` for more details.
	 * @param id - The local ID to normalize.
	 * @returns The ID in op space.
	 */
	normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId;

	/**
	 * Normalizes an ID into session space.
	 * @param id - The ID to normalize.
	 * @param originSessionId - The session from which `id` originated. This should be the ID of the client that normalized `id` to op space.
	 * This means that it may not be the client that created `id` in the first place, but rather the client that serialized it.
	 * This is an important distinction in the case of a reference, where a client might refer to an ID created by another client.
	 * @returns The session-space ID in the local session corresponding to `id`.
	 */
	normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId;

	/**
	 * Decompresses a previously compressed ID into a UUID.
	 * @param id - The compressed ID to be decompressed.
	 * @returns The UUID associated with the compressed ID.
	 * @throws If the ID was not generated by any session known to this compressor.
	 */
	decompress(id: SessionSpaceCompressedId): StableId;

	/**
	 * Recompresses a UUID.
	 * @param uncompressed - The UUID to recompress.
	 * @returns The `CompressedId` associated with `uncompressed`.
	 * @throws If the UUID was not generated by any session known to this compressor.
	 */
	recompress(uncompressed: StableId): SessionSpaceCompressedId;

	/**
	 * Attempts to recompress a UUID.
	 * @param uncompressed - The UUID to recompress.
	 * @returns The `CompressedId` associated with `uncompressed` or undefined if the UUID was not generated by any session known to this compressor.
	 */
	tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined;
}
