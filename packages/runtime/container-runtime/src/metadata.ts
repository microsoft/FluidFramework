/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Does the metadata object look like batch metadata?
 */
export function isBatchMetadata(metadata: any): metadata is IBatchMetadata {
	return typeof metadata?.batch === "boolean";
}

/**
 * Cast the given metadata object to IBatchMetadata if it is so, otherwise yield undefined
 */
export function asBatchMetadata(metadata: unknown): IBatchMetadata | undefined {
	return isBatchMetadata(metadata) ? metadata : undefined;
}

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
 * ContainerRuntime needs to know if this is a replayed savedOp as those need to be skipped in stashed ops scenarios.
 */
export interface ISavedOpMetadata {
	savedOp?: boolean;
}
