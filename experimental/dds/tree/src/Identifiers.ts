/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type-safe identifiers for specific use cases.
 */

/**
 * A 128-bit Universally Unique IDentifier. Represented here
 * with a string of the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,
 * where x is a lowercase hex digit.
 * @alpha
 */
export type UuidString = string & { readonly UuidString: '9d40d0ae-90d9-44b1-9482-9f55d59d5465' };

/**
 * An identifier associated with a session for the purpose of attributing its created content to some user/entity.
 * @alpha
 */
export type AttributionId = UuidString;

/**
 * A version 4, variant 2 uuid (https://datatracker.ietf.org/doc/html/rfc4122).
 * @internal
 */
export type StableId = UuidString & { readonly StableId: '53172b0d-a3d5-41ea-bd75-b43839c97f5a' };

/**
 * A StableId which is suitable for use as a session identifier
 * @internal
 */
export type SessionId = StableId & { readonly SessionId: '4498f850-e14e-4be9-8db0-89ec00997e58' };

/**
 * Edit identifier
 * @alpha
 */
export type EditId = UuidString & { readonly EditId: '56897beb-53e4-4e66-85da-4bf5cd5d0d49' };

/**
 * Scoped to a single edit: identifies a sequences of nodes that can be moved into a trait.
 *
 * Within a given Edit, any DetachedSequenceId must be a source at most once, and a destination at most once.
 * If used as a source, it must be after it is used as a destination.
 * If this is violated, the Edit is considered malformed.
 * @alpha
 */
export type DetachedSequenceId = number & { readonly DetachedSequenceId: 'f7d7903a-194e-45e7-8e82-c9ef4333577d' };

/**
 * An identifier (UUID) that has been shortened by a distributed compression algorithm.
 * @alpha
 */
export type CompressedId = FinalCompressedId | LocalCompressedId;

/**
 * The ID of the string that has been interned, which can be used by a {@link StringInterner} to retrieve the original string.
 * @internal
 */
export type InternedStringId = number & { readonly InternedStringId: 'e221abc9-9d17-4493-8db0-70c871a1c27c' };

/**
 * A brand for identity types that are unique within a particular session (SharedTree instance).
 * @alpha
 */
export interface SessionUnique {
	readonly SessionUnique: 'cea55054-6b82-4cbf-ad19-1fa645ea3b3e';
}

/**
 * A compressed ID that has been normalized into "session space" (see `IdCompressor` for more).
 * Consumer-facing APIs and data structures should use session-space IDs as their lifetime and equality is stable and tied to the
 * compressor that produced them.
 * @alpha
 */
export type SessionSpaceCompressedId = CompressedId & SessionUnique;

/**
 * A compressed ID that has been normalized into "op space" (see `IdCompressor` for more).
 * Serialized/persisted structures (e.g. ops) should use op-space IDs as a performance optimization, as they require no normalizing when
 * received by a remote client due to the fact that op space for a given compressor is session space for all other compressors.
 * @internal
 */
export type OpSpaceCompressedId = CompressedId & {
	readonly OpNormalized: '9209432d-a959-4df7-b2ad-767ead4dbcae';
};

/**
 * A compressed ID that is local to a document. Stable across all revisions of a document starting from the one in which it was created.
 * It should not be persisted outside of the history as it can only be decompressed in the context of the originating document.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 * @alpha
 */
export type FinalCompressedId = number & {
	readonly FinalCompressedId: '5d83d1e2-98b7-4e4e-a889-54c855cfa73d';

	// Same brand as OpNormalizedCompressedId, as final IDs are always finally normalized
	readonly OpNormalized: '9209432d-a959-4df7-b2ad-767ead4dbcae';
};

/**
 * A compressed ID that is local to a session (can only be decompressed when paired with a SessionId).
 * It should not be persisted outside of the history as it can only be decompressed in the context of the originating session.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 * @alpha
 */
export type LocalCompressedId = number & {
	readonly LocalCompressedId: '6fccb42f-e2a4-4243-bd29-f13d12b9c6d1';
} & SessionUnique; // Same brand as CompressedId, as local IDs are always locally normalized

/**
 * @alpha
 */
export interface NodeIdBrand {
	readonly NodeId: 'e53e7d6b-c8b9-431a-8805-4843fc639342';
}

/**
 * Node identifier.
 * Identifies a node within a document.
 * @alpha
 */
export type NodeId = number & SessionSpaceCompressedId & NodeIdBrand;

export type FinalNodeId = FinalCompressedId & NodeIdBrand;

/**
 * A Node identifier which is persisted by SharedTree internals. Not usable as a {@link NodeId}.
 * @internal
 */
export type OpSpaceNodeId = number & OpSpaceCompressedId & NodeIdBrand;

/**
 * Globally unique node identifier.
 * Uniquely identifies a node within and across documents. Can be used across SharedTree instances.
 * @alpha
 */
export type StableNodeId = string & { readonly StableNodeId: 'a0843b38-699d-4bb2-aa7a-16c502a71151' };

/**
 * Definition.
 * A full (Uuid) persistable definition.
 * @alpha
 */
export type Definition = UuidString & { readonly Definition: 'c0ef9488-2a78-482d-aeed-37fba996354c' };

/**
 * Definition.
 * A full (Uuid) persistable label for a trait.
 * @alpha
 */
export type TraitLabel = UuidString & { readonly TraitLabel: '613826ed-49cc-4df3-b2b8-bfc6866af8e3' };

/**
 * Determine if a node is a DetachedSequenceId.
 * @internal
 */
// Nodes can be an `object` type which is a banned type.
export function isDetachedSequenceId(node: DetachedSequenceId | object): node is DetachedSequenceId {
	return typeof node !== 'object';
}
