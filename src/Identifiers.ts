/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type-safe identifiers for specific use cases.
 */

/**
 * A 128-bit Universally Unique IDentifier. Represented here
 * with a string of the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,
 * where x is a lowercase hex digit.
 * @public
 */
export type UuidString = string & { readonly UuidString: '9d40d0ae-90d9-44b1-9482-9f55d59d5465' };

/**
 * A 128-bit Universally Unique IDentifier. Represented here
 * with a string of the form xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,
 * where x is a lowercase hex digit.
 * @internal
 */
export type MinimalUuidString = string & { readonly MinimalUuidString: '1b423880d0bb474c9207966fb613c1e2' };

/**
 * A version 4, variant 2 uuid (https://datatracker.ietf.org/doc/html/rfc4122) that has had its hyphens removed.
 * @internal
 */
export type StableId = MinimalUuidString & { readonly StableId: '53172b0da3d541eabd75b43839c97f5a' };

/**
 * A StableId which is suitable for use as a session identifier
 * @internal
 */
export type SessionId = StableId & { readonly SessionId: '4498f850-e14e-4be9-8db0-89ec00997e58' };

/**
 * Edit identifier
 * @public
 */
export type EditId = UuidString & { readonly EditId: '56897beb-53e4-4e66-85da-4bf5cd5d0d49' };

/**
 * Scoped to a single edit: identifies a sequences of nodes that can be moved into a trait.
 *
 * Within a given Edit, any DetachedSequenceId must be a source at most once, and a destination at most once.
 * If used as a source, it must be after it is used as a destination.
 * If this is violated, the Edit is considered malformed.
 * @public
 */
export type DetachedSequenceId = number & { readonly DetachedSequenceId: 'f7d7903a-194e-45e7-8e82-c9ef4333577d' };

/**
 * An identifier that has been shortened by a distributed compression algorithm.
 * @internal
 */
export type CompressedId = FinalCompressedId | LocalCompressedId;

/**
 * A compressed ID that is local to a document. Stable across all revisions of a document starting from the one in which it was created.
 * It should not be persisted outside of the history as it can only be decompressed in the context of the originating document.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 * @internal
 */
export type FinalCompressedId = number & { readonly FinalCompressedId: '5d83d1e2-98b7-4e4e-a889-54c855cfa73d' };

/**
 * A compressed ID that is local to a session (can only be decompressed when paired with a SessionId).
 * It should not be persisted outside of the history as it can only be decompressed in the context of the originating session.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 * @internal
 */
export type LocalCompressedId = number & { readonly LocalCompressedId: '6fccb42f-e2a4-4243-bd29-f13d12b9c6d1' };

/**
 * Node identifier.
 * Identifies a node within a document.
 * @public
 */
export type NodeId = UuidString & { readonly NodeId: 'e53e7d6b-c8b9-431a-8805-4843fc639342' };

/**
 * Definition.
 * A full (Uuid) persistable definition.
 * @public
 */
export type Definition = UuidString & { readonly Definition: 'c0ef9488-2a78-482d-aeed-37fba996354c' };

/**
 * Definition.
 * A full (Uuid) persistable label for a trait.
 * @public
 */
export type TraitLabel = UuidString & { readonly TraitLabel: '613826ed-49cc-4df3-b2b8-bfc6866af8e3' };
