/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluid-internal/client-utils";
import { IDeltaManagerFull } from "@fluidframework/container-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt, formatTick } from "@fluidframework/telemetry-utils/internal";

/**
 * DeltaScheduler is responsible for the scheduling of inbound delta queue in cases where there
 * is more than one op a particular run of the queue. It does not schedule if there is just one
 * op or just one batch in the run. It does the following two things:
 *
 * 1. If the ops have been processed for more than a specific amount of time, it pauses the queue
 * and calls setTimeout to schedule a resume of the queue. This ensures that we don't block
 * the JS thread for a long time processing ops synchronously (for example, when catching up
 * ops right after boot or catching up ops / delayed realizing data stores by summarizer).
 *
 * 2. If we scheduled a particular run of the queue, it logs telemetry for the number of ops
 * processed, the time and number of turns it took to process the ops.
 */
export class DeltaScheduler {
	private readonly deltaManager: IDeltaManagerFull;
	// The time for processing ops in a single turn.
	public static readonly processingTime = 50;

	// The increase in time for processing ops after each turn.
	private readonly processingTimeIncrement = 10;

	private processingStartTime: number | undefined;
	private currentAllowedProcessingTimeForTurn: number = DeltaScheduler.processingTime;

	// This keeps track of the number of times inbound queue has been scheduled. After a particular
	// count, we log telemetry for the number of ops processed, the time and number of turns it took
	// to process the ops.
	private schedulingCount: number = 0;

	private schedulingLog:
		| {
				opsRemainingToProcess: number;
				totalProcessingTime: number;
				numberOfTurns: number;
				numberOfBatchesProcessed: number;
				lastSequenceNumber: number;
				firstSequenceNumber: number;
				startTime: number;
		  }
		| undefined;

	constructor(
		deltaManager: IDeltaManagerFull,
		private readonly logger: ITelemetryLoggerExt,
	) {
		this.deltaManager = deltaManager;
		this.deltaManager.inbound.on("idle", () => {
			this.inboundQueueIdle();
		});
	}

	public batchBegin(message: ISequencedDocumentMessage) {
		if (!this.processingStartTime) {
			this.processingStartTime = performance.now();
		}
		if (this.schedulingLog === undefined && this.schedulingCount % 500 === 0) {
			// Every 500th time we are scheduling the inbound queue, we log telemetry for the
			// number of ops processed, the time and number of turns it took to process the ops.
			this.schedulingLog = {
				opsRemainingToProcess: 0,
				numberOfTurns: 1,
				totalProcessingTime: 0,
				numberOfBatchesProcessed: 0,
				firstSequenceNumber: message.sequenceNumber,
				lastSequenceNumber: message.sequenceNumber,
				startTime: performance.now(),
			};
		}
	}

	public batchEnd(message: ISequencedDocumentMessage) {
		if (this.schedulingLog) {
			this.schedulingLog.numberOfBatchesProcessed++;
			this.schedulingLog.lastSequenceNumber = message.sequenceNumber;
			this.schedulingLog.opsRemainingToProcess = this.deltaManager.inbound.length;
		}

		if (this.shouldRunScheduler()) {
			const currentTime = performance.now();
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const elapsedTime = currentTime - this.processingStartTime!;
			if (elapsedTime > this.currentAllowedProcessingTimeForTurn) {
				// We have processed ops for more than the total processing time. So, pause the
				// queue, yield the thread and schedule a resume.

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this.deltaManager.inbound.pause();

				// Increase the total processing time. Keep doing this after each turn until all the ops have
				// been processed. This way we keep the responsiveness at the beginning while also making sure
				// that all the ops process fairly quickly.
				this.currentAllowedProcessingTimeForTurn += this.processingTimeIncrement;

				// If we are logging the telemetry this time, update the telemetry log object.
				if (this.schedulingLog) {
					this.schedulingLog.numberOfTurns++;
					this.schedulingLog.totalProcessingTime += elapsedTime;
				}

				setTimeout(() => {
					if (this.schedulingLog) {
						this.logger.sendTelemetryEvent({
							eventName: "InboundOpsPartialProcessingTime",
							duration: formatTick(elapsedTime),
							opsProcessed:
								this.schedulingLog.lastSequenceNumber -
								this.schedulingLog.firstSequenceNumber +
								1,
							opsRemainingToProcess: this.deltaManager.inbound.length,
							processingTime: formatTick(this.schedulingLog.totalProcessingTime),
							numberOfTurns: this.schedulingLog.numberOfTurns,
							batchesProcessed: this.schedulingLog.numberOfBatchesProcessed,
							timeToResume: formatTick(performance.now() - currentTime),
						});
					}
					this.deltaManager.inbound.resume();
				});

				this.processingStartTime = undefined;
			}
		}
	}

	private inboundQueueIdle() {
		if (this.schedulingLog) {
			// Add the time taken for processing the final ops to the total processing time in the
			// telemetry log object.
			const currentTime = performance.now();
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.schedulingLog.totalProcessingTime += currentTime - this.processingStartTime!;

			this.logger.sendTelemetryEvent({
				eventName: "InboundOpsProcessingTime",
				opsRemainingToProcess: this.schedulingLog.opsRemainingToProcess,
				numberOfTurns: this.schedulingLog.numberOfTurns,
				processingTime: formatTick(this.schedulingLog.totalProcessingTime),
				opsProcessed:
					this.schedulingLog.lastSequenceNumber - this.schedulingLog.firstSequenceNumber + 1,
				batchesProcessed: this.schedulingLog.numberOfBatchesProcessed,
				duration: formatTick(currentTime - this.schedulingLog.startTime),
				schedulingCount: this.schedulingCount,
			});

			this.schedulingLog = undefined;
		}

		// If we scheduled this batch of the inbound queue, increment the counter that tracks the
		// number of times we have done this.
		this.schedulingCount++;

		// Reset the processing times.
		this.processingStartTime = undefined;
		this.currentAllowedProcessingTimeForTurn = DeltaScheduler.processingTime;
	}

	/**
	 * This function tells whether we should run the scheduler.
	 */
	private shouldRunScheduler(): boolean {
		// If there are still ops in the queue after the one we are processing now, we should
		// run the scheduler.
		return this.deltaManager.inbound.length > 0;
	}
}
