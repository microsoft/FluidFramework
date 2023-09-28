/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Batching makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IBatchMetadata {
	batch?: boolean;
}

/**
 * Blob handling makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IBlobMetadata {
	blobId?: string;
	localId?: string;
}

/**
 * The IdCompressor needs to know if this is a replayed savedOp as those need to be skipped in stashed ops scenarios.
 */
export interface IIdAllocationMetadata {
	savedOp?: boolean;
}
