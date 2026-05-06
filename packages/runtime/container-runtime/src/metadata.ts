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
	emptyBatch?: true;
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
	/**
	 * Set on the envelope of a grouped batch op to the number of inner ops it contains.
	 * Exposed on the wire so consumers can record batch sizes in telemetry without parsing the grouped batch contents.
	 *
	 * Observable values:
	 * - Absent: either this is not a grouped batch envelope (e.g. a singleton batch that bypassed grouping), OR the producing runtime predates this field. Until the rollout is complete, telemetry consumers should treat absence as ambiguous and parse the envelope contents if a precise count is required for a grouped batch.
	 * - `0`: empty-grouped-batch placeholder produced when a resubmitted batch becomes empty.
	 * - `N` (N \> 0): grouped batch with N inner ops. For a chunked grouped batch this appears only on the last chunk's envelope (intermediate chunks carry no metadata).
	 *
	 * The field is intentionally advisory-only: the runtime does not validate that an inbound value matches the batch's actual inner op count. It is consumed exclusively by off-runtime telemetry.
	 *
	 * The field is always (re)stamped at outbound time from the current batch's actual size — `groupBatch` reads `batch.messages.length` directly, `createEmptyGroupedBatch` always writes `0`, and the chunking path only ever sees freshly-grouped envelopes from the same flush. It is never propagated from stashed pending state to the wire: on resubmit, ops re-enter grouping and the count is recomputed from the (possibly squashed, dropped, or added) outbound batch. This means the wire value always reflects the actual outbound size, even when the resubmitted batch differs from the original.
	 */
	groupedOpCount?: number;
}

/**
 * Blob handling makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IBlobMetadata {
	blobId: string;
	localId: string;
}

export const isBlobMetadata = (metadata: unknown): metadata is IBlobMetadata => {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		typeof (metadata as IBlobMetadata).blobId === "string" &&
		typeof (metadata as IBlobMetadata).localId === "string"
	);
};

/**
 * ContainerRuntime needs to know if this is a replayed savedOp as those need to be skipped in stashed ops scenarios.
 */
export interface ISavedOpMetadata {
	savedOp?: boolean;
}
