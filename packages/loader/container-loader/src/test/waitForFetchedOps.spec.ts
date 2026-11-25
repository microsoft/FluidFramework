/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { DeltaQueue } from "../deltaQueue.js";
import {
	waitForFetchedOpsToBeProcessed,
	type WaitForFetchedOpsResult,
} from "../waitForFetchedOps.js";

/**
 * What the simulated runtime does to the inbound queue after it processes an op.
 *
 * - `"yield"` pauses the queue and resumes it on a later macrotask, like container-runtime's `DeltaScheduler`.
 *
 * - `"hold"` pauses the queue after op `holdAfterSeq` and does not resume it.
 */
type RuntimeBehavior = { kind: "yield" } | { kind: "hold"; holdAfterSeq: number };

describe("waitForFetchedOpsToBeProcessed", () => {
	interface TestRun {
		readonly queue: DeltaQueue<number>;
		lastProcessedSeq: number;
		stopped: boolean;
	}
	let run: TestRun;

	afterEach(() => {
		// Stop scheduled resumes, so that a queue that keeps receiving ops does not outlive its test.
		run.stopped = true;
	});

	/**
	 * Creates a queue that holds ops `1..opCount` and starts to process them with `behavior`.
	 * @param onResume - Called each time a yield resumes the queue, before the resume.
	 */
	function startProcessing(
		opCount: number,
		behavior: RuntimeBehavior,
		onResume?: () => void,
	): void {
		const queue = new DeltaQueue<number>((seq) => {
			thisRun.lastProcessedSeq = seq;
			if (behavior.kind === "yield") {
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				queue.pause();
				setTimeout(() => {
					if (thisRun.stopped) {
						return;
					}
					onResume?.();
					queue.resume();
				}, 0);
			} else if (seq === behavior.holdAfterSeq) {
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				queue.pause();
			}
		});
		const thisRun: TestRun = { queue, lastProcessedSeq: 0, stopped: false };
		run = thisRun;
		for (let seq = 1; seq <= opCount; seq++) {
			queue.push(seq);
		}
		queue.resume();
	}

	async function wait(targetSeqNumber: number): Promise<WaitForFetchedOpsResult> {
		return waitForFetchedOpsToBeProcessed(
			run.queue,
			() => run.lastProcessedSeq,
			targetSeqNumber,
			() => false,
		);
	}

	it("waits across yields until all queued ops are processed", async () => {
		startProcessing(10, { kind: "yield" });

		const result = await wait(10);

		assert.strictEqual(run.lastProcessedSeq, 10);
		assert.strictEqual(result.remainingOps, 0);
		assert.strictEqual(result.stoppedBecausePaused, false);
	});

	it("returns at the target without waiting for ops queued after it", async () => {
		// Each resume delivers another op, so the queue never drains while the runtime keeps yielding.
		let nextSeq = 11;
		startProcessing(10, { kind: "yield" }, () => run.queue.push(nextSeq++));

		const result = await wait(5);

		assert.strictEqual(run.lastProcessedSeq, 5);
		assert(result.remainingOps > 0, "ops after the target should still be queued");
		assert.strictEqual(result.stoppedBecausePaused, false);
	});

	it("returns without deadlocking when the queue is held", async () => {
		startProcessing(10, { kind: "hold", holdAfterSeq: 3 });

		const result = await wait(10);

		assert.strictEqual(run.lastProcessedSeq, 3);
		assert.strictEqual(result.remainingOps, 7);
		assert.strictEqual(result.stoppedBecausePaused, true);
	});
});
