/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, IFluidErrorBase } from "@fluidframework/telemetry-utils";
import { assert, performance, unreachableCase } from "@fluidframework/common-utils";
import { isUnpackedRuntimeMessage } from "@fluidframework/driver-utils";
import {
    DataCorruptionError,
    DataProcessingError,
    extractSafePropertiesFromMessage,
} from "@fluidframework/container-utils";
import { DeltaScheduler } from "./deltaScheduler";
import { pkgVersion } from "./packageVersion";
import { latencyThreshold } from "./connectionTelemetry";

type IRuntimeMessageMetadata = undefined | {
    batch?: boolean;
};

/**
 * The internal state of the batch schedule
 *
 * Individual - processing an individual message
 * Batch - processing a message which is part of a batch
 * Error - encountered an error between processing ops
 * None - In between batches or individual messages
 */
type BatchProcessingState = "Individual" | "Batch" | "Error" | "None";

/**
 * Relative to a batch, a message can be:
 *
 * StartOfBatch - the first message in a batch, marking the start
 * EndOfBatch - the last message in a batch, marking the end
 * Individual - part of a batch (including a one message batch)
 */
type MessageBatchState = "StartOfBatch" | "EndOfBatch" | "Individual";

const messageMetadata = (message: ISequencedDocumentMessage): IRuntimeMessageMetadata | undefined =>
    message.metadata as IRuntimeMessageMetadata;

const messageBatchState = (message: ISequencedDocumentMessage): MessageBatchState => {
    switch (messageMetadata(message)?.batch) {
        case true: return "StartOfBatch";
        case false: return "EndOfBatch";
        default: return "Individual";
    }
};

/**
 * This class has the following responsibilities:
 * 1. It tracks batches as we process ops and raises "batchBegin" and "batchEnd" events.
 *    As part of it, it validates batch correctness (i.e. no system ops in the middle of batch)
 * 2. It creates instance of ScheduleManagerCore that ensures we never start processing ops from batch
 *    unless all ops of the batch are in.
 */
export class ScheduleManager {
    private readonly deltaScheduler: DeltaScheduler;
    private state: BatchProcessingState = "None";

    constructor(
        private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly emitter: EventEmitter,
        readonly clientId: () => string | undefined,
        private readonly logger: ITelemetryLogger,
    ) {
        this.deltaScheduler = new DeltaScheduler(
            this.deltaManager,
            ChildLogger.create(this.logger, "DeltaScheduler"),
        );
        void new ScheduleManagerCore(deltaManager, clientId, logger);
    }

    public beforeOpProcessing(message: ISequencedDocumentMessage) {
        const messageState = messageBatchState(message);
        switch (this.state) {
            case "Batch":
                assert(messageState !== "StartOfBatch", "Batch was interrupted by another batch");
                // We're already processing a batch, do nothing
                return;

            case "Individual":
                assert(messageState !== "StartOfBatch", "Batch was interrupted by another batch");
                this.startBatch(messageState, message);
                return;

            case "None": {
                assert(messageState !== "EndOfBatch", "Batch was interrupted by another batch");
                this.startBatch(messageState, message);
                return;
            }

            case "Error":
                assert(false, "Should not be processing ops");

            default:
                unreachableCase(this.state);
        }
    }

    public afterOpProcessing(error: any | undefined, message: ISequencedDocumentMessage) {
        if (error) {
            // We assume here that loader will close container and stop processing all future ops.
            // This is an implicit dependency. If this flow changes, this code might no longer be correct.
            this.endBatch(error, message);
            return;
        }

        const messageState = messageBatchState(message);
        switch (this.state) {
            case "Batch":
                if (messageState !== "EndOfBatch") {
                    // This is a message that is part of the current batch, do nothing
                    return;
                }

                this.endBatch(error, message);
                return;

            case "Individual":
                assert(messageState === "Individual" || messageState === "EndOfBatch",
                    "Calls to afterOpProcessing and beforeOpProcessing out of sync");
                this.endBatch(error, message);
                return;

            case "None":
                assert(false, "Calls to afterOpProcessing and beforeOpProcessing out of sync");
            case "Error":
                assert(false, "Cannot finish processing a batch after an error");
            default:
                unreachableCase(this.state);
        }
    }

    private startBatch(messageState: MessageBatchState, message: ISequencedDocumentMessage) {
        this.emitter.emit("batchBegin", message);
        this.deltaScheduler.batchBegin(message);
        this.state = messageState === "Individual" ? "Individual" : "Batch";
    }

    private endBatch(error: any | undefined, message: ISequencedDocumentMessage) {
        this.state = error === undefined ? "None" : "Error";
        this.emitter.emit("batchEnd", error, message);
        this.deltaScheduler.batchEnd(message);
    }
}

/**
 * This class controls pausing and resuming of inbound queue to ensure that we never
 * start processing ops in a batch IF we do not have all ops in the batch.
 */
class ScheduleManagerCore {
    private pauseSequenceNumber: number | undefined;
    private currentBatchClientId: string | undefined;
    private localPaused = false;
    private timePaused = 0;
    private batchCount = 0;

    constructor(
        private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly clientId: () => string | undefined,
        private readonly logger: ITelemetryLogger,
    ) {
        // Listen for delta manager sends and add batch metadata to messages
        this.deltaManager.on("prepareSend", (messages: IDocumentMessage[]) => {
            if (messages.length === 0) {
                return;
            }

            // First message will have the batch flag set to true if doing a batched send
            const firstMessageMetadata = messages[0].metadata as IRuntimeMessageMetadata;
            if (!firstMessageMetadata?.batch) {
                return;
            }

            // If the batch contains only a single op, clear the batch flag.
            if (messages.length === 1) {
                delete firstMessageMetadata.batch;
                return;
            }

            // Set the batch flag to false on the last message to indicate the end of the send batch
            const lastMessage = messages[messages.length - 1];
            lastMessage.metadata = { ...lastMessage.metadata, batch: false };
        });

        // Listen for updates and peek at the inbound
        this.deltaManager.inbound.on(
            "push",
            (message: ISequencedDocumentMessage) => {
                this.trackPending(message);
            });

        // Start with baseline - empty inbound queue.
        assert(!this.localPaused, 0x293 /* "initial state" */);

        const allPending = this.deltaManager.inbound.toArray();
        for (const pending of allPending) {
            this.trackPending(pending);
        }

        // We are intentionally directly listening to the "op" to inspect system ops as well.
        // If we do not observe system ops, we are likely to hit 0x296 assert when system ops
        // precedes start of incomplete batch.
        this.deltaManager.on("op", (message) => this.afterOpProcessing(message.sequenceNumber));
    }

    /**
     * The only public function in this class - called when we processed an op,
     * to make decision if op processing should be paused or not after that.
     */
    public afterOpProcessing(sequenceNumber: number) {
        assert(!this.localPaused, 0x294 /* "can't have op processing paused if we are processing an op" */);

        // If the inbound queue is ever empty, nothing to do!
        if (this.deltaManager.inbound.length === 0) {
            assert(this.pauseSequenceNumber === undefined,
                0x295 /* "there should be no pending batch if we have no ops" */);
            return;
        }

        // The queue is
        // 1. paused only when the next message to be processed is the beginning of a batch. Done in two places:
        //    - here (processing ops until reaching start of incomplete batch)
        //    - in trackPending(), when queue was empty and start of batch showed up.
        // 2. resumed when batch end comes in (in trackPending())

        // do we have incomplete batch to worry about?
        if (this.pauseSequenceNumber !== undefined) {
            assert(sequenceNumber < this.pauseSequenceNumber,
                0x296 /* "we should never start processing incomplete batch!" */);
            // If the next op is the start of incomplete batch, then we can't process it until it's fully in - pause!
            if (sequenceNumber + 1 === this.pauseSequenceNumber) {
                this.pauseQueue();
            }
        }
    }

    private pauseQueue() {
        assert(!this.localPaused, 0x297 /* "always called from resumed state" */);
        this.localPaused = true;
        this.timePaused = performance.now();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.deltaManager.inbound.pause();
    }

    private resumeQueue(startBatch: number, messageEndBatch: ISequencedDocumentMessage) {
        const endBatch = messageEndBatch.sequenceNumber;
        const duration = this.localPaused ? (performance.now() - this.timePaused) : undefined;

        this.batchCount++;
        if (this.batchCount % 1000 === 1) {
            this.logger.sendTelemetryEvent({
                eventName: "BatchStats",
                sequenceNumber: endBatch,
                length: endBatch - startBatch + 1,
                msnDistance: endBatch - messageEndBatch.minimumSequenceNumber,
                duration,
                batchCount: this.batchCount,
                interrupted: this.localPaused,
            });
        }

        // Return early if no change in value
        if (!this.localPaused) {
            return;
        }

        this.localPaused = false;

        // Random round number - we want to know when batch waiting paused op processing.
        if (duration !== undefined && duration > latencyThreshold) {
            this.logger.sendErrorEvent({
                eventName: "MaxBatchWaitTimeExceeded",
                duration,
                sequenceNumber: endBatch,
                length: endBatch - startBatch,
            });
        }

        this.deltaManager.inbound.resume();
    }

    /**
     * Called for each incoming op (i.e. inbound "push" notification)
     */
    private trackPending(message: ISequencedDocumentMessage) {
        assert(this.deltaManager.inbound.length !== 0,
            0x298 /* "we have something in the queue that generates this event" */);

        assert((this.currentBatchClientId === undefined) === (this.pauseSequenceNumber === undefined),
            0x299 /* "non-synchronized state" */);

        const messageState = messageBatchState(message);

        // Protocol messages are never part of a runtime batch of messages
        if (!isUnpackedRuntimeMessage(message)) {
            // Protocol messages should never show up in the middle of the batch!
            if (this.currentBatchClientId !== undefined) {
                // We've received a system message in the middle of the batch
                throw DataProcessingError.create(
                    "Received a system message during batch processing", // Formerly known as assert 0x29a
                    "trackPending",
                    message,
                    {
                        runtimeVersion: pkgVersion,
                        batchClientId: this.currentBatchClientId,
                        pauseSequenceNumber: this.pauseSequenceNumber,
                        localBatch: this.currentBatchClientId === this.clientId(),
                    });
            }

            assert(messageState === "Individual", 0x29b /* "system op in a batch?" */);
            assert(!this.localPaused, 0x29c /* "we should be processing ops when there is no active batch" */);
            return;
        }

        if (this.currentBatchClientId === undefined && messageState === "Individual") {
            assert(!this.localPaused, 0x29d /* "we should be processing ops when there is no active batch" */);
            return;
        }

        // If the client ID changes then we can move the pause point. If it stayed the same then we need to check.
        // If batchMetadata is not undefined then if it's true we've begun a new batch - if false we've ended
        // the previous one
        if (this.currentBatchClientId !== message.clientId &&
            (this.currentBatchClientId !== undefined || messageState === "EndOfBatch")) {
            // Batch not closed, yet message from another client!
            this.handleMessageFlowInconsistency(
                message,
                "OpBatchIncomplete",
                new DataCorruptionError(
                    "OpBatchIncomplete",
                    {
                        runtimeVersion: pkgVersion,
                        batchClientId: this.currentBatchClientId,
                        pauseSequenceNumber: this.pauseSequenceNumber,
                        localBatch: this.currentBatchClientId === this.clientId(),
                        localMessage: message.clientId === this.clientId(),
                        ...extractSafePropertiesFromMessage(message),
                    }));
        }

        // The queue is
        // 1. paused only when the next message to be processed is the beginning of a batch. Done in two places:
        //    - in afterOpProcessing() - processing ops until reaching start of incomplete batch
        //    - here (batchMetadata == false below), when queue was empty and start of batch showed up.
        // 2. resumed when batch end comes in (EndOfBatch case below)
        switch (messageState) {
            case "StartOfBatch":
                assert(this.currentBatchClientId === undefined, 0x29e /* "there can't be active batch" */);
                assert(!this.localPaused, 0x29f /* "we should be processing ops when there is no active batch" */);
                this.pauseSequenceNumber = message.sequenceNumber;
                this.currentBatchClientId = message.clientId;
                // Start of the batch
                // Only pause processing if queue has no other ops!
                // If there are any other ops in the queue, processing will be stopped when they are processed!
                if (this.deltaManager.inbound.length === 1) {
                    this.pauseQueue();
                }
                break;

            case "EndOfBatch":
                assert(this.pauseSequenceNumber !== undefined, 0x2a0 /* "batch presence was validated above" */);
                // Batch is complete, we can process it!
                this.resumeQueue(this.pauseSequenceNumber, message);
                this.pauseSequenceNumber = undefined;
                this.currentBatchClientId = undefined;
                break;

            default:
                // Continuation of current batch. Do nothing
                assert(this.currentBatchClientId !== undefined, 0x2a1 /* "logic error" */);
        }
    }

    private handleMessageFlowInconsistency(
        message: ISequencedDocumentMessage,
        eventName: string,
        error: IFluidErrorBase,
    ) {
        const localMessage = message.clientId === this.clientId();
        if (localMessage) {
            // The message originated from the current client or is relative to the current client.
            // Aborting, so that we limit the spread of this inconsistency
            throw error;
        }

        this.logger.sendErrorEvent({ eventName }, error);
    }
}
