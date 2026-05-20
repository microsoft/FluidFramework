/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IIdCompressor,
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from "@fluidframework/id-compressor";
import { v5 as uuidV5 } from "uuid";

/**
 * An encoded identifier that can be decoded without an originator session id.
 * A finalized compressed id — the same numeric value in op-space and session-space.
 */
export type OriginatorlessEncodedId = SessionSpaceCompressedId & OpSpaceCompressedId;

/**
 * An encoded identifier that may require an originator session id to decode.
 * Any op-space compressed id, either finalized or session-local.
 */
export type OriginatorDependentEncodedId = OpSpaceCompressedId;

/**
 * Namespace used for the deterministic UUIDv5 produced by the heal-on-decode workaround
 * in {@link forceDecodeEncodedIdWithoutSession}.
 *
 * This scheme requires consensus across all clients to function — every client that
 * encounters the same unresolvable id must produce the same v5 UUID.
 */
const healingNamespace = "f8a89df3-6882-400f-b913-4c1f6f0157bd";

/**
 * Decode an {@link OriginatorlessEncodedId} without needing an originator session id.
 *
 * The id is guaranteed to be final by the type contract; it is normalized via
 * {@link IIdCompressor.tryNormalizeToSessionSpaceWithoutSession}, which handles the
 * cluster-aligned-local case rather than relying on the bare numeric value.
 */
export function decodeOriginatorlessEncodedId(
	id: OriginatorlessEncodedId,
	idCompressor: IIdCompressor,
): SessionSpaceCompressedId {
	const sessionSpaceId = idCompressor.tryNormalizeToSessionSpaceWithoutSession(id);
	assert(
		sessionSpaceId !== undefined,
		"OriginatorlessEncodedId must be a finalized compressed id at runtime",
	);
	return sessionSpaceId;
}

/**
 * Decode an {@link OriginatorDependentEncodedId} using a known originator session id.
 */
export function decodeEncodedIdWithOriginator(
	id: OriginatorDependentEncodedId,
	originator: SessionId,
	idCompressor: IIdCompressor,
): SessionSpaceCompressedId {
	return idCompressor.normalizeToSessionSpace(id, originator);
}

/**
 * Decode an {@link OriginatorDependentEncodedId} without a session.
 *
 * Returns the session-space id if `id` is finalized (and therefore resolvable
 * without an originator session), or `undefined` if `id` is a non-final op-space
 * id that cannot be resolved without the originator session.
 */
export function tryDecodeEncodedIdWithoutSession(
	id: OriginatorDependentEncodedId,
	idCompressor: IIdCompressor,
): SessionSpaceCompressedId | undefined {
	return idCompressor.tryNormalizeToSessionSpaceWithoutSession(id);
}

/**
 * Decode an op-space compressed id without a session.
 *
 * If the id is finalized it is returned as a session-space id (final ids are
 * invariant across the two spaces). If it is a non-final op-space id, the
 * behavior depends on `options.enableHealingWorkaround`:
 *
 * - When enabled, synthesizes a deterministic UUIDv5 from `options.sharedObjectId`
 * so that all clients loading the same blob agree on the resulting value.
 * This UUID is *not* a `StableId` (which must be a v4 UUID) — it is a
 * v5 UUID, but is still a valid `string` identifier value. The `string` arm of
 * the return type covers this case.
 *
 * - When disabled, throws.
 */
export function forceDecodeEncodedIdWithoutSession(
	id: OpSpaceCompressedId,
	idCompressor: IIdCompressor,
	options:
		| {
				readonly enableHealingWorkaround: true;
				readonly sharedObjectId: string;
		  }
		| { readonly enableHealingWorkaround: false; readonly sharedObjectId?: string },
): SessionSpaceCompressedId | string {
	// `tryDecodeEncodedIdWithoutSession` handles the finalized-id case.
	const decoded = tryDecodeEncodedIdWithoutSession(id, idCompressor);
	if (decoded !== undefined) {
		return decoded;
	}
	// Only reached when `id` is a non-final op-space compressed id.
	if (options.enableHealingWorkaround) {
		// Documents written before the encode-side fix for non-finalized identifier
		// values can persist negative op-space ids that are no longer resolvable
		// once the originating session's local state has been stripped. Synthesize
		// a deterministic v5 UUID so all readers of the same blob agree.
		return uuidV5(`${options.sharedObjectId}|${id}`, healingNamespace);
	}
	// See `SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode` for details on this error.
	throw new Error(
		"Summary could not be loaded due incorrectly encoded identifier. See SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode for mitigation.",
	);
}

/**
 * Convert a decoded, but possibly compressed, identifier to the decompressed string format.
 *
 * Session-space compressed ids are decompressed to their UUID representation via the compressor.
 * String inputs pass through unchanged — they are already in the stored form,
 * whether a `StableId` UUID, a heal-synthesized v5 UUID or other arbitrary string identifier.
 */
export function decompressIdentifierIfNeeded(
	id: SessionSpaceCompressedId | string,
	idCompressor: IIdCompressor,
): string {
	if (typeof id === "string") {
		return id;
	} else {
		const decompressed = idCompressor.decompress(id);
		assert(typeof decompressed === "string", "Decompressed id must be a string");
		return decompressed;
	}
}
