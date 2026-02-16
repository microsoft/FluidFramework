/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ITelemetryContext } from "@fluidframework/runtime-definitions/internal";

import { getEffectiveBatchId } from "./batchManager.js";
import type { BatchStartInfo } from "./remoteMessageProcessor.js";

/**
 * This class tracks recent batchIds we've seen, and checks incoming batches for duplicates.
 */
export class DuplicateBatchDetector {
	/**
	 * Map from batchId to sequenceNumber
	 */
	private readonly seqNumByBatchId = new Map<string, number>();

	/**
	 * We map from sequenceNumber to batchId to find which ones we can stop tracking as MSN advances
	 */
	private readonly batchIdsBySeqNum = new Map<number, string>();

	/**
	 * Track the minimum sequence number currently stored to optimize clearOldBatchIds
	 */
	private minSeqNum: number = Infinity;

	/**
	 * Initialize from snapshot data if provided - otherwise initialize empty
	 */
	constructor(batchIdsFromSnapshot: [number, string][] | undefined) {
		if (batchIdsFromSnapshot) {
			for (const [seqNum, batchId] of batchIdsFromSnapshot) {
				this.batchIdsBySeqNum.set(seqNum, batchId);
				this.seqNumByBatchId.set(batchId, seqNum);
				if (seqNum < this.minSeqNum) {
					this.minSeqNum = seqNum;
				}
			}
		}
	}

	/**
	 * Records this batch's batchId, and checks if it's a duplicate of a batch we've already seen.
	 * If it's a duplicate, also return the sequence number of the other batch for logging.
	 *
	 * @remarks We also use the minimumSequenceNumber to clear out old batchIds that are no longer at risk for duplicates.
	 */
	public processInboundBatch(
		batchStart: BatchStartInfo,
	): { duplicate: true; otherSequenceNumber: number } | { duplicate: false } {
		const { sequenceNumber, minimumSequenceNumber } = batchStart.keyMessage;

		// Glance at this batch's MSN. Any batchIds we're tracking with a lower sequence number are now safe to forget.
		// Why? Because any other client holding the same batch locally would have seen the earlier batch and closed before submitting its duplicate.
		this.clearOldBatchIds(minimumSequenceNumber);

		// getEffectiveBatchId is only needed in the SUPER rare/surprising case where
		// the original batch (not resubmitted, so no batchId) arrives in parallel with a resubmitted batch.
		// In the presence of typical network conditions, this would not be possible
		// (the original batch should roundtrip WAY before another container could rehydrate, connect, and resubmit)
		const batchId = getEffectiveBatchId(batchStart);

		// O(1) duplicate check + get otherSequenceNumber in one lookup
		const otherSequenceNumber = this.seqNumByBatchId.get(batchId);
		if (otherSequenceNumber !== undefined) {
			assert(
				this.batchIdsBySeqNum.get(otherSequenceNumber) === batchId,
				"batchIdToSeqNum and seqNumToBatchId should be in sync for duplicate",
			);
			return { duplicate: true, otherSequenceNumber };
		}

		// Now we know it's not a duplicate, so add it to the tracked batchIds and return.
		assert(
			!this.batchIdsBySeqNum.has(sequenceNumber),
			"seqNumToBatchId and batchIdToSeqNum should be in sync",
		);

		// Add new batch
		this.batchIdsBySeqNum.set(sequenceNumber, batchId);
		this.seqNumByBatchId.set(batchId, sequenceNumber);

		// Update minSeqNum if this is the new minimum
		if (sequenceNumber < this.minSeqNum) {
			this.minSeqNum = sequenceNumber;
		}

		return { duplicate: false };
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number): void {
		// Early exit: if MSN hasn't passed our oldest entry, nothing to delete
		if (msn <= this.minSeqNum) {
			return;
		}

		let newMinSeqNum = Infinity;

		for (const [sequenceNumber, batchId] of this.batchIdsBySeqNum) {
			if (sequenceNumber < msn) {
				this.batchIdsBySeqNum.delete(sequenceNumber);
				this.seqNumByBatchId.delete(batchId);
			} else if (sequenceNumber < newMinSeqNum) {
				newMinSeqNum = sequenceNumber;
			}
		}

		this.minSeqNum = newMinSeqNum;
	}

	/**
	 * Returns a snapshot of the state of the detector which can be included in a summary
	 * and used to "rehydrate" this class when loading from a snapshot.
	 *
	 * @returns A serializable object representing the state of the detector, or undefined if there is nothing to save.
	 */
	public getRecentBatchInfoForSummary(
		telemetryContext?: ITelemetryContext,
	): [number, string][] | undefined {
		if (this.batchIdsBySeqNum.size === 0) {
			return undefined;
		}

		telemetryContext?.set(
			"fluid_DuplicateBatchDetector_",
			"recentBatchCount",
			this.batchIdsBySeqNum.size,
		);

		return [...this.batchIdsBySeqNum.entries()];
	}
}
