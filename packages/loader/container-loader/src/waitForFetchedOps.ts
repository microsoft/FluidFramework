/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaQueue } from "@fluidframework/container-definitions/internal";

/**
 * Result of {@link waitForFetchedOpsToBeProcessed}, used for telemetry.
 */
export interface WaitForFetchedOpsResult {
	/**
	 * The sequence number that the wait tried to reach.
	 */
	readonly targetSeqNumber: number;
	/**
	 * The number of processing turns that the wait observed.
	 */
	readonly turns: number;
	/**
	 * The number of ops still in the inbound queue when the wait returned.
	 */
	readonly remainingOps: number;
	/**
	 * Whether the wait returned because the queue stayed paused without progress.
	 */
	readonly stoppedBecausePaused: boolean;
}

/**
 * Waits until the inbound queue has processed the ops up to `targetSeqNumber`.
 *
 * @remarks
 * `IDeltaQueue.waitTillProcessingDone()` only waits for the current processing turn.
 * The runtime can pause the inbound queue during a turn and resume it later,
 * for example to yield the JS thread after a processing time budget (see container-runtime's `DeltaScheduler`).
 * In that case the processing turn ends while ops are still queued.
 *
 * This function yields a macrotask whenever processing stops with ops still queued,
 * so that such scheduled resumes can run, and then waits for processing again.
 * It returns when either:
 *
 * - the op with `targetSeqNumber` has been processed,
 *
 * - the inbound queue is empty,
 *
 * - `isClosed` returns `true`, or
 *
 * - the queue stays paused across the yield without any progress.
 * This means that some other component holds the queue (for example, the runtime waits for the rest of an incomplete batch,
 * or the application is in staging mode).
 * Waiting further could deadlock, because the ops that release the hold might not be available yet.
 *
 * The last condition assumes that a temporary yield schedules its resume during the processing turn,
 * with a `setTimeout` delay no longer than the delay of this function's yield.
 * `DeltaScheduler` meets this assumption.
 * A component that pauses the queue and resumes it later than that is treated as a hold.
 *
 * @param inbound - The inbound op queue.
 * @param getLastProcessedSeqNumber - Returns the sequence number of the last processed op.
 * @param targetSeqNumber - The sequence number of the last op to wait for.
 * Ops queued after it do not delay the return.
 * @param isClosed - Returns whether the container is closed.
 */
export async function waitForFetchedOpsToBeProcessed(
	inbound: Pick<IDeltaQueue<unknown>, "length" | "paused" | "waitTillProcessingDone">,
	getLastProcessedSeqNumber: () => number,
	targetSeqNumber: number,
	isClosed: () => boolean,
): Promise<WaitForFetchedOpsResult> {
	let turns = 0;
	let stoppedBecausePaused = false;

	while (true) {
		await inbound.waitTillProcessingDone();
		turns++;
		if (isClosed() || inbound.length === 0 || getLastProcessedSeqNumber() >= targetSeqNumber) {
			break;
		}

		// Processing stopped with ops still queued, so something paused the queue.
		// Yield a macrotask so that a resume scheduled with setTimeout can run before we check again.
		// The resumed turn can pause again (and schedule another resume), so detect a hold by lack of progress.
		const seqBeforeYield = getLastProcessedSeqNumber();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		if (
			!isClosed() &&
			inbound.paused &&
			inbound.length > 0 &&
			getLastProcessedSeqNumber() === seqBeforeYield
		) {
			stoppedBecausePaused = true;
			break;
		}
	}

	return {
		targetSeqNumber,
		turns,
		remainingOps: inbound.length,
		stoppedBecausePaused,
	};
}
