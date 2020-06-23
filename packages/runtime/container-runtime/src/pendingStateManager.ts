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
    // This stores all the messages in the batch that we are processing. This is used to verify that we get the
    // correct batch metadata.
    private pendingBatchMessages: ISequencedDocumentMessage[] = [];

    private get connected(): boolean {
        return this.containerRuntime.connected;
    }

    public setConnectionState(connected: boolean) {
        assert(this.connected === connected, "The connection state is not consistent with the runtime");

        if (connected) {
            this.replayPendingStates();
        }
    }

    public isPendingState(): boolean {
        return !this.pendingStates.isEmpty();
    }

    constructor(private readonly containerRuntime: ContainerRuntime) { }

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

    public processPendingLocalMessage(message: ISequencedDocumentMessage): unknown {
        let pendingState = this.pendingStates.peekFront();
        assert(pendingState, "No pending message found for this remote message");

        // Process "flush" type messages first, if any.
        while (pendingState.type !== "message") {
            // Process the pending "flush" state and verify that we get correct batch metadata.
            this.processFlushState(pendingState);

            // Get the next message from the pending queue.
            this.pendingStates.shift();
            pendingState = this.pendingStates.peekFront();
            assert(pendingState, "No pending message found for this remote message");
        }

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

        // Remove the first message from the pending list since it has been processed.
        this.pendingStates.shift();

        if (this.isProcessingBatch) {
            // If we are processing a batch, add this message to the pending batch queue.
            this.pendingBatchMessages.push(message);

            // This may be the last message in the batch. If so, we need to process the "flush" state for batch end as
            // we have received the entire batch.
            const nextPendingState = this.pendingStates.peekFront();
            assert(nextPendingState, "We should at least have the pending flush state indicating end of batch");

            if (nextPendingState.type === "flush") {
                this.processFlushState(nextPendingState);
                this.pendingStates.shift();
            }
        }

        return pendingState.localOpMetadata;
    }

    /**
     * Verifies that the batch metadata is received as the per the "flush" state.
     * @param pendingState - The "flush" state to process.
     */
    private processFlushState(pendingState: IPendingState) {
        assert(pendingState.type === "flush", "Invalid pending state type");

        const pendingFlushMode = pendingState.flushMode;

        // If FlushMode was set to Manual, this is the beginning of a batch.
        if (pendingFlushMode === FlushMode.Manual) {
            // We should not already be processing a batch.
            assert(!this.isProcessingBatch, "FlushMode should never be set to Manual in the middle of a batch");

            this.pendingBatchMessages = [];
            this.isProcessingBatch = true;
            return;
        }

        // If FlushMode was set to Automatic, a batch just ended. Verify that we received the correct batch metadata
        // for this batch.
        if (pendingFlushMode === FlushMode.Automatic) {
            // We should have been processing a batch.
            assert(this.isProcessingBatch, "Did not receive batch messages as expected");

            const batchCount = this.pendingBatchMessages.length;
            // There should be at least one batch message.
            assert(batchCount > 0, "Did not receive any batch message in the batch");

            const batchBeginMetadata = this.pendingBatchMessages[0].metadata?.batch;
            const batchEndMetadata = this.pendingBatchMessages[batchCount - 1].metadata?.batch;

            if (batchCount === 1) {
                // If there is a single message in the batch, it should not have any batch metadata.
                assert(batchBeginMetadata === undefined,
                    "Batch with single message should not have batch metadata");
            } else {
                // For multiple messages in the batch, assert that we got batch begin and end metadata.
                assert(batchBeginMetadata === true, "Did not receive batch begin metadata");
                assert(batchEndMetadata === false, "Did not receive batch end metadata");
            }

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
