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
	private readonly batchIdsAll = new Set<string>();

	private readonly batchIdBySeqNum = new Map<number, string>();

	public processInboundBatch(
		inboundBatch: InboundBatch,
	): { duplicate: true; otherSequenceNumber: number } | { duplicate: false } {
		const { sequenceNumber, minimumSequenceNumber } = inboundBatch.keyMessage;

		this.clearOldBatchIds(minimumSequenceNumber);

		// getEffectiveBatchId is only needed in the SUPER rare/surprising case where
		// the original batch (not resubmitted, so no batchId) arrives in parallel with a resubmitted batch.
		// In the presence of typical network conditions, this would not be possible
		// (the original batch should roundtrip WAY before another container could rehydrate, connect, and resubmit)
		const batchId = getEffectiveBatchId(inboundBatch);

		// Check this batch against the tracked batchIds to see if it's a duplicate
		if (this.batchIdsAll.has(batchId)) {
			for (const [trackedSequenceNumber, trackedBatchId] of this.batchIdBySeqNum.entries()) {
				if (trackedBatchId === batchId) {
					return {
						duplicate: true,
						otherSequenceNumber: trackedSequenceNumber,
					};
				}
			}
			assert(false, "Should have found the batchId in batchIdBySeqNum map");
		}
		// Now we know it's not a duplicate, so add it to the tracked batchIds and return.
		assert(
			!this.batchIdBySeqNum.has(sequenceNumber),
			"Shouldn't add a batchId that's already tracked",
		);
		this.batchIdBySeqNum.set(sequenceNumber, batchId);
		this.batchIdsAll.add(batchId);

		return { duplicate: false };
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number) {
		this.batchIdBySeqNum.forEach((batchId, sequenceNumber) => {
			if (sequenceNumber < msn) {
				this.batchIdBySeqNum.delete(sequenceNumber);
				this.batchIdsAll.delete(batchId);
			}
		});
	}
}
