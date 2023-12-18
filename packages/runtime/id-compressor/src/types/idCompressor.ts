/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionSpaceCompressedId, OpSpaceCompressedId, SessionId, StableId } from "./identifiers";
import {
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "./persisted-types";

/**
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
 * @public
 */
export interface IIdCompressor {
	localSessionId: SessionId;

	/**
	 * Generates a new compressed ID or returns an existing one.
	 * This should ONLY be called to generate IDs for local operations.
	 * @returns A new local ID in session space.
	 */
	generateCompressedId(): SessionSpaceCompressedId;
	/**
	 * Normalizes a session space ID into op space.
	 * @param id - the local ID to normalize.
	 * @returns the ID in op space.
	 */
	normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId;
	/**
	 * Normalizes an ID into session space.
	 * @param id - the ID to normalize. If it is a local ID, it is assumed to have been created by the session corresponding
	 * to `sessionId`.
	 * @param originSessionId - the session from which `id` originated
	 * @returns the session-space ID corresponding to `id`, which might not have been a final ID if the client that created it had not yet
	 * finalized it. This can occur when a client references an ID during the window of time in which it is waiting to receive the ordered
	 * range that contained it from the server.
	 */
	normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId;

	/**
	 * Decompresses a previously compressed ID into a UUID.
	 * @param id - the compressed ID to be decompressed.
	 * @returns the UUID associated with the compressed ID. Fails if the ID was not generated by this compressor.
	 */
	decompress(id: SessionSpaceCompressedId): StableId;

	/**
	 * Recompresses a UUID.
	 * @param uncompressed - the UUID to recompress.
	 * @returns the `CompressedId` associated with `uncompressed`. Fails if it has not been previously compressed by this compressor.
	 */
	recompress(uncompressed: StableId): SessionSpaceCompressedId;

	/**
	 * Attempts to recompresses a UUID.
	 * @param uncompressed - the UUID to recompress,
	 * @returns the `CompressedId` associated with `uncompressed` or undefined if it has not been previously compressed by this compressor.
	 */
	tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined;
}
