/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IErrorBase } from "@fluidframework/container-definitions";
import { CustomErrorWithProps } from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import {
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import Deque from "double-ended-queue";
import { ContainerRuntime, ContainerMessageType } from "./containerRuntime";

export class DataCorruptionError extends CustomErrorWithProps implements IErrorBase {
    readonly errorType = "dataCorruptionError";
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        props: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

/**
 * This represents a message that has been submitted and is added to the pending queue when `submit` is called on the
 * ContainerRuntime. This message has either not been ack'd by the server or has not been submitted to the server yet.
 */
interface IPendingMessage {
    type: "message";
    messageType: ContainerMessageType;
    clientSequenceNumber: number;
    content: any;
    localOpMetadata: unknown;
    opMetaData: unknown;
}

/**
 * This represents a FlushMode update and is added to the pending queue when `setFlushMode` is called on the
 * ContainerRuntime and the FlushMode changes.
 */
interface IPendingFlushMode {
    type: "flushMode";
    flushMode: FlushMode;
}

/**
 * This represents a manual flush and is added to the pending queue when `flush` is called on the ContainerRuntime to
 * flush any pending messages. This is applicable only when the FlushMode is Manual.
 */
interface IPendingFlush {
    type: "flush";
}

type IPendingState = IPendingMessage | IPendingFlushMode | IPendingFlush;

/**
 * PendingStateManager is responsible for maintaining the messages that have not been sent or have not yet been
 * acknowledged by the server. It also maintains the batch information for both automatically and manually flushed
 * batches along with the messages.
 * When the Container reconnects, it replays the pending states, which includes setting the FlushMode, manual flushing
 * of messages and triggering resubmission of unacked ops.
 *
 * It verifies that all the ops are acked, are received in the right order and batch information is correct.
 */
export class PendingStateManager {
    private readonly pendingStates = new Deque<IPendingState>();

    // Maintains the count of messages that are currently unacked.
    private pendingMessagesCount: number = 0;

    // Indicates whether we are processing a batch.
    private isProcessingBatch: boolean = false;

    // This stores the first message in the batch that we are processing. This is used to verify that we get
    // the correct batch metadata.
    private pendingBatchBeginMessage: ISequencedDocumentMessage | undefined;

    private clientId: string | undefined;

    private get connected(): boolean {
        return this.containerRuntime.connected;
    }

    /**
     * Called to check if there are any pending messages in the pending state queue.
     * @returns A boolean indicating whether there are messages or not.
     */
    public hasPendingMessages(): boolean {
        return this.pendingMessagesCount !== 0;
    }

    constructor(private readonly containerRuntime: ContainerRuntime) { }

    /**
     * Called when a message is submitted locally. Adds the message and the associated details to the pending state
     * queue.
     * @param type - The container message type.
     * @param clientSequenceNumber - The clientSequenceNumber associated with the message.
     * @param content - The message content.
     * @param localOpMetadata - The local metadata associated with the message.
     */
    public onSubmitMessage(
        type: ContainerMessageType,
        clientSequenceNumber: number,
        content: any,
        localOpMetadata: unknown,
        opMetaData: unknown) {
        const pendingMessage: IPendingMessage = {
            type: "message",
            messageType: type,
            clientSequenceNumber,
            content,
            localOpMetadata,
            opMetaData,
        };

        this.pendingStates.push(pendingMessage);

        this.pendingMessagesCount++;
    }

    /**
     * Called when the FlushMode is updated. Adds the FlushMode to the pending state queue.
     * @param flushMode - The flushMode that was updated.
     */
    public onFlushModeUpdated(flushMode: FlushMode) {
        if (flushMode === FlushMode.Automatic) {
            const previousState = this.pendingStates.peekBack();

            // We don't have to track a previous "flush" state because FlushMode.Automatic flushes the messages. So,
            // just tracking this FlushMode.Automatic is enough.
            if (previousState?.type === "flush") {
                this.pendingStates.removeBack();
            }

            // If no messages were sent between FlushMode.Manual and FlushMode.Automatic, then we do not have to track
            // both these states. Remove FlushMode.Manual from the pending queue and return.
            if (previousState?.type === "flushMode" && previousState.flushMode === FlushMode.Manual) {
                this.pendingStates.removeBack();
                return;
            }
        }

        const pendingFlushMode: IPendingFlushMode = {
            type: "flushMode",
            flushMode,
        };
        this.pendingStates.push(pendingFlushMode);
    }

    /**
     * Called when flush() is called on the ContainerRuntime to manually flush messages.
     */
    public onFlush() {
        // If the FlushMode is Automatic, we should not track this flush call as it is only applicable when FlushMode
        // is Manual.
        if (this.containerRuntime.flushMode === FlushMode.Automatic) {
            return;
        }

        // If the previous state is not a message, we don't have to track this flush call as there is nothing to flush.
        const previousState = this.pendingStates.peekBack();
        if (previousState?.type !== "message") {
            return;
        }

        // Note that because of the checks above and the checks in onFlushModeUpdated(), we can be sure that a "flush"
        // state always has a "message" before and after it. So, it marks the end of a batch and the beginning of a
        // new one.
        const pendingFlush: IPendingFlush = {
            type: "flush",
        };
        this.pendingStates.push(pendingFlush);
    }

    /**
     * Processes a local message once its ack'd by the server. It verifies that there was no data corruption and that
     * the batch information was preserved for batch messages.
     * @param message - The messsage that got ack'd and needs to be processed.
     */
    public processPendingLocalMessage(message: ISequencedDocumentMessage): unknown {
        // Pre-processing part - This may be the start of a batch.
        this.maybeProcessBatchBegin(message);

        // Get the next state from the pending queue and verify that it is of type "message".
        const pendingState = this.peekNextPendingState();
        assert(pendingState.type === "message", "No pending message found for this remote message");
        this.pendingStates.shift();

        // Processing part - Verify that there has been no data corruption.
        // The clientSequenceNumber of the incoming message must match that of the pending message.
        if (pendingState.clientSequenceNumber !== message.clientSequenceNumber) {
            // Close the container because this indicates data corruption.
            const error = new DataCorruptionError(
                "Unexpected ack received",
                {
                    clientId: message.clientId,
                    sequenceNumber: message.sequenceNumber,
                    clientSequenceNumber: message.clientSequenceNumber,
                    expectedClientSequenceNumber: pendingState.clientSequenceNumber,
                },
            );

            this.containerRuntime.closeFn(error);
            return;
        }

        this.pendingMessagesCount--;

        // Post-processing part - If we are processing a batch then this could be the last message in the batch.
        if (this.isProcessingBatch) {
            this.maybeProcessBatchEnd(message);
        }

        return pendingState.localOpMetadata;
    }

    /**
     * This message could be the first message in batch. If so, set batch state marking the beginning of a batch.
     * @param message - The message that is being processed.
     */
    private maybeProcessBatchBegin(message: ISequencedDocumentMessage) {
        const pendingState = this.peekNextPendingState();
        if (pendingState.type !== "flush" && pendingState.type !== "flushMode") {
            return;
        }

        // If the pending state is of type "flushMode", it must be Manual since Automatic flush mode is processed
        // after a message is processed and not before.
        if (pendingState.type === "flushMode") {
            assert(pendingState.flushMode === FlushMode.Manual,
                "Flush mode should be manual when processing batch begin");
        }

        // We should not already be processing a batch and there should be no pending batch begin message.
        assert(!this.isProcessingBatch && this.pendingBatchBeginMessage === undefined,
            "The pending batch state indicates we are already processing a batch");

        // Set the pending batch state indicating we have started processing a batch.
        this.pendingBatchBeginMessage = message;
        this.isProcessingBatch = true;

        // Remove this pending state from the queue as we have processed it.
        this.pendingStates.shift();
    }

    private maybeProcessBatchEnd(message: ISequencedDocumentMessage) {
        const nextPendingState = this.peekNextPendingState();
        if (nextPendingState.type !== "flush" && nextPendingState.type !== "flushMode") {
            return;
        }

        // If the next pending state is of type "flushMode", it must be Automatic and if so, we need to remove it from
        // the queue.
        // Note that we do not remove the type "flush" from the queue because it indicates the end of one batch and the
        // beginning of a new one. So, it will removed when the next batch begin is processed.
        if (nextPendingState.type === "flushMode") {
            assert(nextPendingState.flushMode === FlushMode.Automatic,
                "Flush mode is set to Manual in the middle of processing a batch");
            this.pendingStates.shift();
        }

        // There should be a pending batch begin message.
        assert(this.pendingBatchBeginMessage !== undefined, "There is no pending batch begin message");

        // Get the batch begin metadata from the first message in the batch.
        const batchBeginMetadata = this.pendingBatchBeginMessage.metadata?.batch;

        // There could be just a single message in the batch. If so, it should not have any batch metadata. If there
        // are multiple messages in the batch, verify that we got the correct batch begin and end metadata.
        if (this.pendingBatchBeginMessage === message) {
            assert(batchBeginMetadata === undefined,
                "Batch with single message should not have batch metadata");
        } else {
            // Get the batch metadata from the last message in the batch.
            const batchEndMetadata = message.metadata?.batch;
            assert(batchBeginMetadata === true, "Did not receive batch begin metadata");
            assert(batchEndMetadata === false, "Did not receive batch end metadata");
        }

        // Clear the pending batch state now that we have processed the entire batch.
        this.pendingBatchBeginMessage = undefined;
        this.isProcessingBatch = false;
    }

    /**
     * Returns the next pending state from the pending state queue.
     */
    private peekNextPendingState(): IPendingState {
        const nextPendingState = this.pendingStates.peekFront();
        assert(nextPendingState, "No pending state found for the remote message");
        return nextPendingState;
    }

    /**
     * Called when the Container's connection state changes. If the Container gets connected, it replays all the pending
     * states in its queue. This includes setting the FlushMode and trigerring resubmission of unacked ops.
     */
    public replayPendingStates() {
        assert(this.connected, "The connection state is not consistent with the runtime");

        // This assert suggests we are about to send same ops twice, which will result in data loss.
        assert(this.clientId !== this.containerRuntime.clientId, "replayPendingStates called twice for same clientId!");
        this.clientId = this.containerRuntime.clientId;

        let pendingStatesCount = this.pendingStates.length;
        if (pendingStatesCount === 0) {
            return;
        }

        // Reset the pending message count because all these messages will be removed from the queue.
        this.pendingMessagesCount = 0;

        // Save the current FlushMode so that we can revert it back after replaying the states.
        const savedFlushMode = this.containerRuntime.flushMode;

        // Process exactly `pendingStatesCount` items in the queue as it represents the number of states that were
        // pending when we connected. This is important because the `reSubmitFn` might add more items in the queue
        // which must not be replayed.
        while (pendingStatesCount > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pendingState = this.pendingStates.shift()!;
            switch (pendingState.type) {
                case "message":
                    {
                        this.containerRuntime.reSubmitFn(
                            pendingState.messageType,
                            pendingState.content,
                            pendingState.localOpMetadata,
                            pendingState.opMetaData);
                    }
                    break;
                case "flushMode":
                    {
                        this.containerRuntime.setFlushMode(pendingState.flushMode);
                    }
                    break;
                case "flush":
                    {
                        this.containerRuntime.flush();
                    }
                    break;
                default:
                    break;
            }
            pendingStatesCount--;
        }

        // Revert the FlushMode.
        this.containerRuntime.setFlushMode(savedFlushMode);
    }
}
