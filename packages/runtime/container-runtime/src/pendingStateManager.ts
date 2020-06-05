/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ErrorType, IDataCorruptionError } from "@fluidframework/container-definitions";
import { ErrorWithProps } from "@fluidframework/driver-utils";
import {
    MessageType,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { strongAssert } from "@fluidframework/runtime-utils";
import Deque from "double-ended-queue";
import { ContainerRuntime } from "./containerRuntime";

export class DataCorruptionError extends ErrorWithProps implements IDataCorruptionError {
    readonly errorType = ErrorType.dataCorruptionError;
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        readonly clientId: string,
        readonly sequenceNumber: number,
        readonly clientSequenceNumber: number,
        readonly expectedClientSequenceNumber?: number,
    ) {
        super(errorMessage);
    }
}

interface IPendingMessage {
    type: "message";
    messageType: MessageType;
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
    // This stores all the messages in the batch that we are processing. This is used to verify that we get the
    // correct batch metadata.
    private pendingBatchMessages: ISequencedDocumentMessage[] = [];

    private get connected(): boolean {
        return this.containerRuntime.connected;
    }

    public setConnectionState(connected: boolean) {
        strongAssert(this.connected === connected, "The connection state is not consistent with the runtime");

        if (connected) {
            this.replayPendingStates();
        }
    }

    public isPendingState(): boolean {
        return !this.pendingStates.isEmpty();
    }

    constructor(private readonly containerRuntime: ContainerRuntime) {}

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

    public onSubmitMessage(type: MessageType, clientSequenceNumber: number, content: any, localOpMetadata: unknown) {
        const pendingMessage: IPendingMessage = {
            type: "message",
            messageType: type,
            clientSequenceNumber,
            content,
            localOpMetadata,
        };

        this.pendingStates.push(pendingMessage);
    }

    public processPendingLocalMessage(message: ISequencedDocumentMessage): unknown {
        let pendingState = this.pendingStates.peekFront();
        strongAssert(pendingState, "No pending message found for this remote message");

        // Process "flush" type messages first, if any.
        while (pendingState.type !== "message") {
            // Process the pending "flush" state and verify that we get correct batch metadata.
            this.processFlushState(pendingState);

            // Get the next message from the pending queue.
            this.pendingStates.shift();
            pendingState = this.pendingStates.peekFront();
            strongAssert(pendingState, "No pending message found for this remote message");
        }

        // The clientSequenceNumber of the incoming message must match that of the pending message.
        if (pendingState.clientSequenceNumber !== message.clientSequenceNumber) {
            // Close the container because this indicates data corruption.
            const error = new DataCorruptionError(
                "Unexpected ack received",
                message.clientId,
                message.sequenceNumber,
                message.clientSequenceNumber,
                pendingState.clientSequenceNumber);

            this.containerRuntime.closeFn(error);
            return;
        }

        // If we are processing a batch, add this message to the pending batch queue.
        if (this.isProcessingBatch) {
            this.pendingBatchMessages.push(message);
        }

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        return pendingState.localOpMetadata;
    }

    /**
     * Verifies that the batch metadata is received as the per the "flush" state.
     * @param message - The message we are currently processing.
     * @param pendingState - The "flush" state to process.
     */
    private processFlushState(pendingState: IPendingState) {
        strongAssert(pendingState.type === "flush", "Invalid pending state type");

        const pendingFlushMode = pendingState.flushMode;

        // If FlushMode was set to Manual prior to this message, this is the beginning of a batch.
        if (pendingFlushMode === FlushMode.Manual) {
            this.pendingBatchMessages = [];
            this.isProcessingBatch = true;
            return;
        }

        // If FlushMode was set to Automatic, a batch just ended. Verify that we received the correct batch metadata
        // for this batch.
        if (pendingFlushMode === FlushMode.Automatic) {
            // We should have been processing a batch.
            strongAssert(this.isProcessingBatch, "Did not receive batch messages as expected");

            const batchCount = this.pendingBatchMessages.length;
            // There should be at least one batch message.
            strongAssert(batchCount > 0, "Did not receive any batch message in the batch");

            const batchBeginMetadata = this.pendingBatchMessages[0].metadata?.batch;
            const batchEndMetadata = this.pendingBatchMessages[batchCount - 1].metadata?.batch;

            // If there is a single message in the batch, it should not have any batch metadata.
            if (batchCount === 1) {
                strongAssert(batchBeginMetadata === undefined,
                    "Batch with single message should not have batch metadata");
                return;
            }

            // Assert that we got batch begin and end metadata.
            strongAssert(batchBeginMetadata === true, "Did not receive batch begin metadata");
            strongAssert(batchEndMetadata === false, "Did not receive batch end metadata");

            this.pendingBatchMessages = [];
            this.isProcessingBatch = false;
        }
    }

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
