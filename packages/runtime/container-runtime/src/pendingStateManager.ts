/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
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

interface IPendingMessage {
    type: "message";
    messageType: ContainerMessageType;
    clientSequenceNumber: number;
    content: any;
    localOpMetadata: unknown;
}

interface IPendingFlushMode {
    type: "flush";
    flushMode: FlushMode;
}

type IPendingState = IPendingMessage | IPendingFlushMode;

/**
 * PendingStateManager is responsible for maintaining the messages that have not been sent or have not yet been
 * acknowledged by the server. It also maintains the batch information (FlushMode) along with the messages.
 * When the Container reconnects, it replays the pending state, which includes setting the FlushMode and triggering
 * resubmission of unacked ops.
 *
 * It verifies that all the ops are acked, are received in the right order and batch information is correct.
 */
export class PendingStateManager {
    private readonly pendingStates = new Deque<IPendingState>();

    // Indicates whether we are processing a batch.
    private isProcessingBatch: boolean = false;
    // This stores the first message in the batch that we are processing. This is used to verify that we get
    // the correct batch metadata.
    private pendingBatchBeginMessage: ISequencedDocumentMessage | undefined;

    private get connected(): boolean {
        return this.containerRuntime.connected;
    }

    /**
     * Called when the Container's connection state changes. If the Container gets connected, it replays all the pending
     * states in its queue.
     * @param connected - true if we got connected, false if we got disconnected.
     */
    public setConnectionState(connected: boolean) {
        assert(this.connected === connected, "The connection state is not consistent with the runtime");

        // If we got connected, replay the pending states that have not been ack'd yet.
        if (connected) {
            this.replayPendingStates();
        }
    }

    /**
     * Called to check if there are any pending states in the pending state queue.
     * @returns A boolean indicating whether the queue is empty or not.
     */
    public isPendingState(): boolean {
        return !this.pendingStates.isEmpty();
    }

    constructor(private readonly containerRuntime: ContainerRuntime) { }

    /**
     * Called when the FlushMode is updated. Adds the FlushMode to the pending state queue.
     * @param flushMode - The flushMode that was updated.
     */
    public onFlushModeUpdated(flushMode: FlushMode) {
        // If no messages were sent between FlushMode.Manual and FlushMode.Automatic, then we do not have to track
        // them. Remove them from the pending queue and return.
        // This is an important step because if this happens and there are no other messages in the queue,
        // isPendingState() above will return true but we do not really have a real state that needs tracking.
        if (flushMode === FlushMode.Automatic) {
            const pendingState = this.pendingStates.peekBack();
            if (pendingState?.type === "flush" && pendingState.flushMode === FlushMode.Manual) {
                this.pendingStates.removeBack();
                return;
            }
        }

        const pendingFlushMode: IPendingFlushMode = {
            type: "flush",
            flushMode,
        };

        this.pendingStates.push(pendingFlushMode);
    }

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
        localOpMetadata: unknown) {
        const pendingMessage: IPendingMessage = {
            type: "message",
            messageType: type,
            clientSequenceNumber,
            content,
            localOpMetadata,
        };

        this.pendingStates.push(pendingMessage);
    }

    /**
     * Processes a local message once its ack'd by the server. It verifies that there was no data corruption and that
     * the batch information was preserved for batch messages.
     * @param message - The messsage that got ack'd and needs to be processed.
     */
    public processPendingLocalMessage(message: ISequencedDocumentMessage): unknown {
        // Pre-processing part - This may be the start of a batch.
        // If so, there must be a pending "flush" state marking the beginning of a batch. Process batch begin and get
        // the pending "message" state that follows.
        let pendingState = this.getNextPendingState();
        if (pendingState.type === "flush") {
            // Process the beginning of the batch.
            this.processBatchBegin(pendingState, message);

            // Get the next state from the pending queue and verify that it is of type "message".
            pendingState = this.getNextPendingState();
            assert(pendingState.type === "message", "No pending message found for this remote message");
        }

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

        // Post-processing part - If we are processing a batch then this could be the last message in the batch.
        // If so, there must be a pending "flush" state marking end of the batch. Verify that and process batch end.
        if (this.isProcessingBatch) {
            const nextPendingState = this.pendingStates.peekFront();
            assert(nextPendingState, "We should at least have the pending flush state indicating end of batch");

            if (nextPendingState.type === "flush") {
                // Got the last message in the batch. Process batch end and remove the "flush" state from the queue.
                this.processBatchEnd(nextPendingState, message);
                this.pendingStates.shift();
            }
        }

        return pendingState.localOpMetadata;
    }

    /**
     * Processes the beginning of a batch. Verifies the pending "flush" state and the pending batch state are correct.
     * @param pendingState - The pending "flush" state marking the beginning of the batch.
     * @param message - The first message in the batch.
     */
    private processBatchBegin(pendingState: IPendingState, message: ISequencedDocumentMessage) {
        assert(pendingState.type === "flush", "The pending state should be of type flush");
        assert(pendingState.flushMode === FlushMode.Manual, "The flush mode must be Manual for batch begin");
        // We should not already be processing a batch and there should be no pending batch begin message.
        assert(!this.isProcessingBatch && this.pendingBatchBeginMessage === undefined,
            "The pending batch state indicates we are already processing a batch");

        // Set the pending batch state indicating we have started processing a batch.
        this.pendingBatchBeginMessage = message;
        this.isProcessingBatch = true;
    }

    /**
     * Processes the end of a batch. Verifies the pending "flush" state and the pending batch state are correct.
     * @param pendingState - The pending "flush" state marking the end of the batch.
     * @param message - The last message in the batch.
     */
    private processBatchEnd(pendingState: IPendingState, message: ISequencedDocumentMessage) {
        assert(pendingState.type === "flush", "The pending state should have been of type flush");
        assert(pendingState.flushMode === FlushMode.Automatic, "The flush mode must be Automatic for batch end");
        // We should be processing a batch and there should be a pending batch begin message.
        assert(this.isProcessingBatch && this.pendingBatchBeginMessage !== undefined,
            "The pending batch state indicates we are not processing a batch");

        // Get the batch begin metadata from the first message in the batch.
        const batchBeginMetadata = this.pendingBatchBeginMessage.metadata?.batch;

        // There could be just a single message in the batch. If so, it should not have any batch metadata. If there
        // are multiple messages in the batch, verify that we got the correct batch begin and end metadata.
        if (this.pendingBatchBeginMessage === message) {
            assert(batchBeginMetadata === undefined,
                "Batch with single message should not have batch metadata");
        } else {
            // Get the batch metadat from the last message in the batch.
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
    private getNextPendingState(): IPendingState {
        const nextPendingState = this.pendingStates.shift();
        assert(nextPendingState, "No pending state found for the remote message");
        return nextPendingState;
    }

    /**
     * Replays all the pending states that are currently in the queue. This includes setting the FlushMode and
     * trigerring resubmission of unacked ops. This typically happens when we reconnect.
     */
    private replayPendingStates() {
        const pendingStatesCount = this.pendingStates.length;
        if (pendingStatesCount === 0) {
            return;
        }

        // Save the current FlushMode so that we can revert it back after replaying the states.
        const savedFlushMode = this.containerRuntime.flushMode;

        // Process exactly `pendingStatesCount` items in the queue as it represents the number of states that were
        // pending when we connected. This is important because the `reSubmitFn` might add more items in the queue
        // which must not be replayed.
        let count = 0;
        while (count < pendingStatesCount) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pendingState = this.pendingStates.shift()!;
            switch (pendingState.type) {
                case "flush":
                    {
                        this.containerRuntime.setFlushMode(pendingState.flushMode);
                    }
                    break;
                case "message":
                    {
                        this.containerRuntime.reSubmitFn(
                            pendingState.messageType,
                            pendingState.content,
                            pendingState.localOpMetadata);
                    }
                    break;
                default:
                    break;
            }
            count++;
        }

        // Revert the FlushMode.
        this.containerRuntime.setFlushMode(savedFlushMode);
    }
}
