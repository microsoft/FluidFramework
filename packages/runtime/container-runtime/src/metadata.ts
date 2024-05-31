/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function isBatchMetadata(metadata: unknown): metadata is IBatchMetadata {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		("batch" in metadata || "batchId" in metadata)
	);
}

export function asBatchMetadata(metadata: unknown): IBatchMetadata | undefined {
	return isBatchMetadata(metadata) ? metadata : undefined;
}

/**
 * Batch metadata is used to identify the start and end of a batch of ops, and the ID of the batch
 */
export type IBatchMetadata =
	| { batch: undefined; batchId: string } // Single op batch
	| { batch: true; batchId: string } // First op in a batch
	| { batch: false; batchId: undefined }; // Last op in a batch

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
