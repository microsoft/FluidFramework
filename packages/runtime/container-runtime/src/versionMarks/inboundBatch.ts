/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getEffectiveBatchId, type InboundMessageResult } from "../opLifecycle/index.js";

/**
 * The version-mark resolver update derived from an inbound batch result.
 *
 * @internal
 */
export interface InboundVersionMarkUpdate {
	/**
	 * A completed batch to record via `processInboundBatch`: its id and its last op's sequence number.
	 * Undefined when no batch completed on this message (a piecemeal batch still in progress).
	 */
	readonly sequenced?: { readonly batchId: string; readonly sequenceNumber: number };
	/**
	 * The batch id to carry for a piecemeal batch still in progress, or undefined when none is pending.
	 * The caller stores this and passes it back on the next inbound result.
	 */
	readonly carriedBatchId: string | undefined;
}

/**
 * Maps an inbound batch result to the version-mark resolver update. A batch's resolved point is its last
 * op's sequence number, so this reports `(batchId, sequenceNumber)` only once a batch completes. It handles
 * both a batch delivered whole (`fullBatch`, incl. an empty grouped batch via the batch-start key message)
 * and one delivered piecemeal (`batchStartingMessage` then `nextBatchMessage` with `batchEnd`), carrying the
 * batch id across the piecemeal messages via `carriedBatchId`.
 *
 * @internal
 */
export function inboundVersionMarkUpdate(
	inboundResult: InboundMessageResult,
	carriedBatchId: string | undefined,
): InboundVersionMarkUpdate {
	if ("batchStart" in inboundResult) {
		const batchId = getEffectiveBatchId(inboundResult.batchStart);
		if (inboundResult.type === "fullBatch") {
			// The last op is the batch's resolved point; an empty batch falls back to the batch-start key message.
			const lastMessage =
				// eslint-disable-next-line unicorn/prefer-at -- Array.prototype.at is not in this package's lib target
				inboundResult.messages[inboundResult.messages.length - 1] ??
				inboundResult.batchStart.keyMessage;
			return {
				sequenced: { batchId, sequenceNumber: lastMessage.sequenceNumber },
				carriedBatchId: undefined,
			};
		}
		// batchStartingMessage: carry the id until the batch's end message arrives.
		return { carriedBatchId: batchId };
	}
	if (
		inboundResult.type === "nextBatchMessage" &&
		inboundResult.batchEnd === true &&
		carriedBatchId !== undefined
	) {
		return {
			sequenced: {
				batchId: carriedBatchId,
				sequenceNumber: inboundResult.nextMessage.sequenceNumber,
			},
			carriedBatchId: undefined,
		};
	}
	// A mid-batch message, or a batch end with no carried id: no change.
	return { carriedBatchId };
}
