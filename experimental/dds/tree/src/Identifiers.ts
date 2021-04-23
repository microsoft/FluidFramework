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
 * @public
 */
export type UuidString = string & { readonly UuidString: '9d40d0ae-90d9-44b1-9482-9f55d59d5465' };

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
