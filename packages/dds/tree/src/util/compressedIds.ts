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
import { isFinalId, isStableId } from "@fluidframework/id-compressor/internal";
import { v5 as uuidV5 } from "uuid";

/**
 * An encoded identifier that can be decoded without an originator session id.
 * A finalized compressed id — the same numeric value in op-space and session-space.
 * @remarks
 * These are safe to use in contexts where the encoding id compressor is available to decode them,
 * even when the session id of the encoding id compressor is not known.
 */
export type OriginatorlessEncodedId = SessionSpaceCompressedId & OpSpaceCompressedId;

/**
 * An encoded identifier that may require an originator session id to decode.
 * Any op-space compressed id, either finalized or session-local.
 * @remarks
 * These are only safe to use in contexts where the encoding id compressor is available
 * and the session id of the encoding id compressor is known.
 * Currently the only such case is in ops, excluding attach summary ops.
 */
export type OriginatorDependentEncodedId = OpSpaceCompressedId;

/**
 * Selects how identifiers are encoded for transport/persistence.
 */
export enum EncodedIdType {
	/**
	 * {@link OriginatorlessEncodedId}.
	 */
	Originatorless,
	/**
	 * {@link OriginatorDependentEncodedId}.
	 */
	OriginatorDependent,
}

export type EncodedId<T extends EncodedIdType> = T extends EncodedIdType.Originatorless
	? OriginatorlessEncodedId
	: T extends EncodedIdType.OriginatorDependent
		? OriginatorDependentEncodedId
		: OriginatorlessEncodedId | OriginatorDependentEncodedId;

/**
 * Context for encoding identifiers.
 * @remarks
 * See {@link FieldBatchDecodingContext} for the decoder.
 */
export interface IdEncodingContext {
	encodePossiblyCompressedId(id: string): string | EncodedId<EncodedIdType>;
}

/**
 * Encode a string identifier into a possibly compressed form based on the requested mode.
 *
 * @param id - The string identifier to encode.
 * @param idCompressor - The ID compressor to use for compression.
 * @param encodedIdType - The type of encoding to use. If the context doing the decoding will have the originator {@link SessionId},
 * then {@link EncodedIdType.OriginatorDependent} can be used.
 * Otherwise, {@link EncodedIdType.Originatorless} must be used.
 *
 * @privateRemarks
 * Performance:
 * When trying to optimize to avoid unnecessary identifier decompression, and store identifiers compressed in memory,
 * this will likely need to be updated to allow in SessionSpaceCompressedIds.
 */
export function encodePossiblyCompressedId<T extends EncodedIdType>(
	id: string,
	idCompressor: IIdCompressor,
	encodedIdType: T,
): string | EncodedId<T> {
	if (!isStableId(id)) {
		return id;
	}
	const sessionSpaceCompressedId = idCompressor.tryRecompress(id);
	if (sessionSpaceCompressedId === undefined) {
		return id;
	}
	const opSpaceId = idCompressor.normalizeToOpSpace(sessionSpaceCompressedId);
	if (encodedIdType === EncodedIdType.Originatorless) {
		return isFinalId(opSpaceId) ? (opSpaceId as unknown as EncodedId<T>) : id;
	}
	return opSpaceId as unknown as EncodedId<T>;
}

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
		0xd0a /* OriginatorlessEncodedId must be a finalized compressed id at runtime */,
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
 * Configuration for the heal-on-decode workaround. The internal counterpart of
 * the user-facing {@link SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode}
 * option — see that option for the user-facing rationale and trade-offs.
 *
 * Carried by decode-side contexts ({@link IdDecoderOptionsOriginatorless},
 * `ChangeEncodingContext.healing`,
 * `EditManagerEncodingContext.healing`, etc.) when the workaround is enabled.
 * Presence enables healing; `undefined` means healing is disabled. There is no separate boolean,
 * which makes it impossible to enable healing without supplying the namespace
 * input.
 */
export interface IdentifierHealingConfig {
	/**
	 * The SharedTree's shared-object id, used as the v5 namespace input so
	 * healed UUIDs are unique across attaches of different documents with the
	 * same session offsets.
	 */
	readonly sharedObjectId: string;
}

/**
 * Decode an op-space compressed id without a session.
 *
 * Finalized ids are returned as session-space ids (final ids are invariant
 * across the two spaces). Non-final ids are healed via {@link IdentifierHealingConfig}
 * if provided, or cause the resolver to throw otherwise. A healed result is a
 * deterministic v5 UUID string — *not* a `StableId`, since that brand requires
 * v4, but still a valid identifier value; the `string` arm of the return type
 * covers this case.
 */
export function forceDecodeEncodedIdWithoutSession(
	id: OpSpaceCompressedId,
	idCompressor: IIdCompressor,
	healing: IdentifierHealingConfig | undefined,
): SessionSpaceCompressedId | string {
	const decoded = tryDecodeEncodedIdWithoutSession(id, idCompressor);
	if (decoded !== undefined) {
		return decoded;
	}
	// `id` is a non-final op-space compressed id.
	if (healing !== undefined) {
		return uuidV5(`${healing.sharedObjectId}|${id}`, healingNamespace);
	}
	throw new Error(
		"Summary could not be loaded due to an incorrectly encoded identifier. See SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode for mitigation.",
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
	idCompressor: Pick<IIdCompressor, "decompress">,
): string {
	if (typeof id === "string") {
		return id;
	} else {
		const decompressed = idCompressor.decompress(id);
		assert(typeof decompressed === "string", 0xd0b /* Decompressed id must be a string */);
		return decompressed;
	}
}

/**
 * Options for creating an {@link IdDecodingContext} without an originator.
 * @remarks
 * Decodes {@link OriginatorlessEncodedId} instances, and optionally has a {@link IdentifierHealingConfig} fallback for {@link OriginatorDependentEncodedId} instances.
 */
export interface IdDecoderOptionsOriginatorless {
	readonly idCompressor: IIdCompressor;
	/**
	 * Optional {@link IdentifierHealingConfig} to use for healing unresolvable identifiers.
	 * @privateRemarks
	 * This is a required field which can be undefined to make it explicit when this is not provided.
	 * This explicitness helps ensure we we don't accidentally drop the healing config as that would break
	 * an edge case which does not get a lot of testing.
	 */
	readonly healing: IdentifierHealingConfig | undefined;
}

/**
 * Options for creating an {@link IdDecodingContext} with an originator.
 * @remarks
 * Decodes {@link OriginatorDependentEncodedId} instances.
 */
export interface IdDecoderOptionsWithOriginator {
	readonly idCompressor: IIdCompressor;
	/**
	 * The ID of the session that encoded the ids.
	 */
	readonly originatorId: SessionId;
}

/**
 * Context for decoding identifiers.
 * @remarks
 * Depended on how this is constructed, it may or may not handle {@link OriginatorDependentEncodedId} instances.
 *
 * This intentionally avoids exposing anything which depends on the underlying id-compressor's session ID to avoid confusion with the session ID of the compressor which encoded the data.
 * If the session ID of the encoder which encoded the data is known, that information is baked into `resolveEncodedId`.
 *
 * @privateRemarks
 * We have code (FieldBatchDecodingContext) which sometimes has a session ID and sometimes doesn't, so we need a flexible decoding context.
 * Additionally, since this is about serialized data, having stronger types is often counterproductive, as it just relies more on type casts when parsing.
 * This is why we use this flexible pattern rather than code strongly typed over which kind of encoded ids are expected.
 */
export class IdDecodingContext {
	/**
	 * Used internally to prevent the use of this decoder in incremental chunks if it has a session id (which would be wrong in those chunks).
	 */
	protected readonly hasOriginatorSessionId: boolean;

	/**
	 * Compressor which can decompress session-space identifiers from {@link resolveEncodedId} as needed.
	 */
	public readonly idCompressor: Pick<IIdCompressor, "decompress">;

	/**
	 * Resolves an encoded op-space identifier to either a session-space ID
	 * (which {@link idCompressor} can decompress if needed)
	 * or a string (which passes through unchanged).
	 * @remarks
	 * In contexts where non-final identifiers can't be supported (where no originator session is available),
	 * if a non-final identifier is encountered, this may throw or perform a data healing workaround.
	 * See {@link FieldBatchDecodingContext.forOp} and {@link FieldBatchDecodingContext.forSummary} for details.
	 */
	public readonly resolveEncodedId: (
		id: OpSpaceCompressedId,
	) => SessionSpaceCompressedId | string;

	/**
	 * Creates a new instance of the context.
	 * @param options - The options for creating the context.
	 */
	public constructor(
		options: IdDecoderOptionsOriginatorless | IdDecoderOptionsWithOriginator,
	) {
		this.idCompressor = options.idCompressor;
		if ("originatorId" in options) {
			this.hasOriginatorSessionId = true;
			this.resolveEncodedId = (id): SessionSpaceCompressedId | string =>
				options.idCompressor.normalizeToSessionSpace(id, options.originatorId);
		} else {
			this.hasOriginatorSessionId = false;
			this.resolveEncodedId = (id): SessionSpaceCompressedId | string =>
				forceDecodeEncodedIdWithoutSession(id, options.idCompressor, options.healing);
		}
	}
}
