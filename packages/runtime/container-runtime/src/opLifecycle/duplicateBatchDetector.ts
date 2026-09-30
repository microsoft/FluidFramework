/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ITelemetryContext } from "@fluidframework/runtime-definitions/internal";

import { getEffectiveBatchId } from "./batchManager.js";
import type { BatchStartInfo } from "./remoteMessageProcessor.js";

/**
 * Identifying info for a previously-recorded batch that we can include in DuplicateBatch telemetry
 * to help diagnose where the duplicate came from.
 *
 * @remarks `batchIdExplicit` distinguishes the two main duplicate-source scenarios:
 * - `true`: the batchId was stamped on the wire as explicit metadata, indicating a resubmit (PendingStateManager.replayPendingStates).
 * - `false`: the batchId was derived from the wire `clientId` and `batchStartCsn`, indicating a fresh, non-resubmit batch.
 */
export interface RecordedBatchInfo {
	/**
	 * Wire clientId on the message that started the batch (NOT necessarily the `originalClientId`
	 * encoded in the batchId for resubmits).
	 */
	readonly clientId: string;
	/**
	 * Wire client sequence number at the start of the batch.
	 */
	readonly batchStartCsn: number;
	/**
	 * True if the batchId came from explicit metadata on the wire (i.e. a resubmit),
	 * false if it was derived from clientId + batchStartCsn (i.e. a fresh submit).
	 */
	readonly batchIdExplicit: boolean;
}

interface RecordedBatch {
	readonly batchId: string;
	/**
	 * Identifying info for the batch as observed at runtime.
	 * `undefined` if the batch was loaded from a summary snapshot (where only the
	 * `[seqNum, batchId]` pair is persisted).
	 */
	readonly info: RecordedBatchInfo | undefined;
}

/**
 * Detects duplicate batches that can arise from the "parallel fork" scenario:
 * Container 1 is serialized, and Containers 2 and 3 are rehydrated from that state.
 * They both catch up and (re)connect in parallel (at the same time), submitting the same local state,
 * sharing the same batchId and sequence number.
 *
 * For "serial fork" detection scenarios see PendingStateManager.
 */
export class DuplicateBatchDetector {
	/**
	 * Map from batchId to sequenceNumber
	 */
	private readonly seqNumByBatchId = new Map<string, number>();

	/**
	 * Map from sequenceNumber to the recorded batch info. Used to clear out old entries as MSN
	 * advances, and to report identifying info about the original occurrence when a duplicate
	 * is detected.
	 */
	private readonly batchesBySeqNum = new Map<number, RecordedBatch>();

	/**
	 * Number of inbound batches processed since the last summary. Reset by getRecentBatchInfoForSummary.
	 */
	private processedBatchCount = 0;

	/**
	 * Largest tracked-batch count observed since the last summary. Reset by getRecentBatchInfoForSummary.
	 */
	private peakTrackedBatchCount = 0;

	/**
	 * Initialize from snapshot data if provided - otherwise initialize empty
	 */
	constructor(batchIdsFromSnapshot: [number, string][] | undefined) {
		if (batchIdsFromSnapshot) {
			for (const [seqNum, batchId] of batchIdsFromSnapshot) {
				// Entries loaded from a snapshot don't carry the original clientId/csn/explicit-bit;
				// we record them with `info: undefined` so duplicate telemetry can indicate that.
				this.batchesBySeqNum.set(seqNum, { batchId, info: undefined });
				this.seqNumByBatchId.set(batchId, seqNum);
			}
			this.peakTrackedBatchCount = this.batchesBySeqNum.size;
		}
	}

	/**
	 * Records this batch's batchId, and checks if it's a duplicate of a batch we've already seen.
	 * If it's a duplicate, also return the sequence number of the other batch (and identifying info,
	 * if the other batch was seen during this container session rather than loaded from snapshot) for logging.
	 *
	 * @remarks We also use the minimumSequenceNumber to clear out old batchIds that are no longer at risk for duplicates.
	 */
	public processInboundBatch(batchStart: BatchStartInfo):
		| {
				duplicate: true;
				otherSequenceNumber: number;
				otherBatchInfo: RecordedBatchInfo | undefined;
		  }
		| { duplicate: false } {
		const { sequenceNumber, minimumSequenceNumber } = batchStart.keyMessage;
		this.processedBatchCount++;

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
			const other = this.batchesBySeqNum.get(otherSequenceNumber);
			assert(
				other?.batchId === batchId,
				0xce0 /* batchIdToSeqNum and seqNumToBatchId should be in sync for duplicate */,
			);
			return {
				duplicate: true,
				otherSequenceNumber,
				otherBatchInfo: other.info,
			};
		}

		// Now we know it's not a duplicate, so add it to the tracked batchIds and return.
		assert(
			!this.batchesBySeqNum.has(sequenceNumber),
			0xce1 /* seqNumToBatchId and batchIdToSeqNum should be in sync */,
		);

		// Add new batch. Record identifying info so we can report it if a future duplicate matches us.
		const info: RecordedBatchInfo | undefined = {
			clientId: batchStart.clientId,
			batchStartCsn: batchStart.batchStartCsn,
			// True iff the wire carried explicit batchId metadata (resubmit path).
			// False indicates the batchId was derived from clientId + batchStartCsn (fresh submit).
			batchIdExplicit: batchStart.batchId !== undefined,
		};
		this.batchesBySeqNum.set(sequenceNumber, { batchId, info });
		this.seqNumByBatchId.set(batchId, sequenceNumber);
		if (this.batchesBySeqNum.size > this.peakTrackedBatchCount) {
			this.peakTrackedBatchCount = this.batchesBySeqNum.size;
		}

		return { duplicate: false };
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number): void {
		for (const [sequenceNumber, recorded] of this.batchesBySeqNum) {
			if (sequenceNumber < msn) {
				this.batchesBySeqNum.delete(sequenceNumber);
				this.seqNumByBatchId.delete(recorded.batchId);
			} else {
				break;
			}
		}
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
		if (telemetryContext !== undefined) {
			const prefix = "fluid_DuplicateBatchDetector_";
			telemetryContext.set(prefix, "recentBatchCount", this.batchesBySeqNum.size);
			telemetryContext.set(prefix, "peakRecentBatchCount", this.peakTrackedBatchCount);
			telemetryContext.set(prefix, "processedBatchCount", this.processedBatchCount);
		}

		// Reset per-window perf counters so each summary covers only the activity since the
		// previous one. Peak resets to the current size (the floor for the next window).
		this.processedBatchCount = 0;
		this.peakTrackedBatchCount = this.batchesBySeqNum.size;

		if (this.batchesBySeqNum.size === 0) {
			return undefined;
		}

		return [...this.batchesBySeqNum.entries()].map(([seqNum, recorded]) => [
			seqNum,
			recorded.batchId,
		]);
	}
}
