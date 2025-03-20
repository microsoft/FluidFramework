/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BatchId } from "./opLifecycle/index.js";

/**
 * Syntactic sugar for casting
 */
export function asBatchMetadata(metadata: unknown): Partial<IBatchMetadata> | undefined {
	return metadata as Partial<IBatchMetadata> | undefined;
}

/**
 * Syntactic sugar for casting
 */
export function asEmptyBatchLocalOpMetadata(
	localOpMetadata: unknown,
): IEmptyBatchMetadata | undefined {
	return localOpMetadata as IEmptyBatchMetadata | undefined;
}

/**
 * Properties put on the localOpMetadata object for empty batches
 */
export interface IEmptyBatchMetadata {
	// Set to true on localOpMetadata for empty batches
	emptyBatch?: boolean;
}
/**
 * Properties put on the op metadata object for batch tracking
 */
export interface IBatchMetadata {
	/**
	 * Set on first/last messages of a multi-message batch, to true/false respectively
	 */
	batch?: boolean;
	/**
	 * Maybe set on first message of a batch, to the batchId generated when resubmitting (set/fixed on first resubmit)
	 */
	batchId?: BatchId;
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
