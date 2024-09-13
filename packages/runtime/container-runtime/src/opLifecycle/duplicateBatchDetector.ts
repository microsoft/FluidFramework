/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { getEffectiveBatchId } from "./batchManager.js";
import { type InboundBatch } from "./remoteMessageProcessor.js";

/**
 * This class tracks recent batchIds we've seen, and checks incoming batches for duplicates.
 */
export class DuplicateBatchDetector {
	/** All batchIds we've seen recently enough (based on MSN) that we need to watch for duplicates */
	private readonly batchIdsAll = new Set<string>();

	/** We map from sequenceNumber to batchId to find which ones we can stop tracking as MSN advances */
	private readonly batchIdsBySeqNum = new Map<number, string>();

	/**
	 * Records this batch's batchId, and checks if it's a duplicate of a batch we've already seen.
	 * If it's a duplicate, also return the sequence number of the other batch for logging.
	 *
	 * @remarks - We also use the minimumSequenceNumber to clear out old batchIds that are no longer at risk for duplicates.
	 */
	public processInboundBatch(
		inboundBatch: InboundBatch,
	): { duplicate: true; otherSequenceNumber: number } | { duplicate: false } {
		const { sequenceNumber, minimumSequenceNumber } = inboundBatch.keyMessage;

		// Glance at this batch's MSN. Any batchIds we're tracking with a lower sequence number are now safe to forget.
		// Why? Because any other client holding the same batch locally would have seen the earlier batch and closed before submitting its duplicate.
		this.clearOldBatchIds(minimumSequenceNumber);

		// getEffectiveBatchId is only needed in the SUPER rare/surprising case where
		// the original batch (not resubmitted, so no batchId) arrives in parallel with a resubmitted batch.
		// In the presence of typical network conditions, this would not be possible
		// (the original batch should roundtrip WAY before another container could rehydrate, connect, and resubmit)
		const batchId = getEffectiveBatchId(inboundBatch);

		// Check this batch against the tracked batchIds to see if it's a duplicate
		if (this.batchIdsAll.has(batchId)) {
			for (const [otherSequenceNumber, otherBatchId] of this.batchIdsBySeqNum.entries()) {
				if (otherBatchId === batchId) {
					return {
						duplicate: true,
						otherSequenceNumber,
					};
				}
			}
			assert(false, 0xa34 /* Should have found the batchId in batchIdBySeqNum map */);
		}

		// Now we know it's not a duplicate, so add it to the tracked batchIds and return.
		assert(
			!this.batchIdsBySeqNum.has(sequenceNumber),
			0xa35 /* batchIdsAll and batchIdsBySeqNum should be in sync */,
		);
		this.batchIdsBySeqNum.set(sequenceNumber, batchId);
		this.batchIdsAll.add(batchId);

		return { duplicate: false };
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number) {
		this.batchIdsBySeqNum.forEach((batchId, sequenceNumber) => {
			if (sequenceNumber < msn) {
				this.batchIdsBySeqNum.delete(sequenceNumber);
				this.batchIdsAll.delete(batchId);
			}
		});
	}
}
