/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ErrorType, IGenericError } from "@microsoft/fluid-driver-definitions";
import {
    MessageType,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { FlushMode } from "@microsoft/fluid-runtime-definitions";
import * as Deque from "double-ended-queue";
import { ContainerRuntime } from "./containerRuntime";

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

    // Indicates whether we are processing a batch of messages.
    private isProcessingBatch: boolean = false;
    // This is the last message that we processed. This is used to verify that batch end metadata is correct.
    private lastProcessedMessage: ISequencedDocumentMessage | undefined;

    private get connected(): boolean {
        return this.containerRuntime.connected;
    }

    public setConnectionState(connected: boolean) {
        assert(this.connected === connected);

        if (connected) {
            this.replayPendingStates();
        }
    }

    constructor(
        private readonly containerRuntime: ContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) {}

    public onFlushModeUpdated(flushMode: FlushMode) {
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
        let flushMode: FlushMode | undefined;
        let pendingState = this.pendingStates.peekFront();

        // Remove all the "flush" states from the queue and get the first "message".
        while (pendingState?.type === "flush") {
            flushMode = pendingState.flushMode;
            this.pendingStates.shift();
            pendingState = this.pendingStates.peekFront();
        }

        // Verify that the batch metadata, if any, is correct.
        this.verifyBatchMetadata(message, flushMode);

        const firstPendingMessage = pendingState;

        // There should always be a pending message for a message for the local client. The clientSequenceNumber of the
        // incoming message must match that of the pending message.
        if (firstPendingMessage?.type !== "message" ||
            firstPendingMessage.clientSequenceNumber !== message.clientSequenceNumber) {
            this.logger.sendErrorEvent({
                eventName: "UnexpectedAckReceived",
                clientId: message.clientId,
                sequenceNumber: message.sequenceNumber,
                receivedClientSequenceNumber: message.clientSequenceNumber,
                expectedClientSequenceNumber:
                    firstPendingMessage?.type === "message" ? firstPendingMessage.clientSequenceNumber : undefined,
            });

            // Close the container because this indicates data corruption.
            const error: IGenericError = {
                errorType: ErrorType.genericError,
                error: new Error("Unexpected ack received"),
                message: "Unexpected ack received",
                canRetry: false,
            };
            this.containerRuntime.closeFn(error);

            return;
        }

        this.lastProcessedMessage = message;

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        return firstPendingMessage.localOpMetadata;
    }

    /**
     * Verifies that the batch metadata is received as the per the FlushMode setting. If logs if we do not get batch
     * metadata as expected or if we get unexpected batch metadata.
     * @param message - The message we are currently processing.
     * @param pendingFlushMode - The FlushMode that was set just prior to this message.
     */
    private verifyBatchMetadata(message: ISequencedDocumentMessage, pendingFlushMode: FlushMode | undefined) {
        const batchMetadata = message.metadata?.batch;

        // If FlushMode was set to Manual prior to this message, it must have batch begin metadata: { batch: true }.
        if (pendingFlushMode === FlushMode.Manual) {
            if (batchMetadata !== true) {
                this.logger.sendErrorEvent({
                    eventName: "BatchBeginNotReceived",
                    clientId: message.clientId,
                    sequenceNumber: message.sequenceNumber,
                    clientSequenceNumber: message.clientSequenceNumber,
                });
            }
            this.isProcessingBatch = true;
            return;
        }

        // If FlushMode is set to Automatic, the last processed message must have batch end metadata: { batch: false }.
        // An expection to this (and the "BatchBeginNotReceived" event above) is if there is only one message in the
        // batch. We cannot check for that condition here since we do not know when "FlushMode.Manual" was set.
        // However, this case is easily verifiable by looking the two events. If the sequenceNumber in these two events
        // are the same, then we have hit this case.
        if (pendingFlushMode === FlushMode.Automatic) {
            const lastMessagebatchMetadata = this.lastProcessedMessage?.metadata?.batch;
            if (lastMessagebatchMetadata !== false) {
                this.logger.sendErrorEvent({
                    eventName: "BatchEndNotReceived",
                    clientId: this.lastProcessedMessage?.clientId,
                    sequenceNumber: this.lastProcessedMessage?.sequenceNumber,
                    clientSequenceNumber: this.lastProcessedMessage?.clientSequenceNumber,
                });
            }
            this.isProcessingBatch = false;
            return;
        }

        // We should not recieve batch begin metadata if FlushMode was not set prior to this message.
        if (batchMetadata === true) {
            this.logger.sendErrorEvent({
                eventName: "UnexpectedBatchBegin",
                clientId: message.clientId,
                sequenceNumber: message.sequenceNumber,
                clientSequenceNumber: message.clientSequenceNumber,
            });
        }

        // We should not receive batch end metadata if we are not in the middle of processing a batch.
        if (batchMetadata === false && this.isProcessingBatch === false) {
            this.logger.sendErrorEvent({
                eventName: "UnexpectedBatchEnd",
                clientId: message.clientId,
                sequenceNumber: message.sequenceNumber,
                clientSequenceNumber: message.clientSequenceNumber,
            });
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
                        switch (pendingState.messageType) {
                            case MessageType.Operation:
                                // For Operations, call reSubmitFn which will find the right component and trigger
                                // resubmission on it.
                                this.containerRuntime.reSubmitFn(pendingState.content, pendingState.localOpMetadata);
                                break;
                            case MessageType.Attach:
                                // For Attach messages, call submitFn which will submit the message again.
                                this.containerRuntime.submitFn(
                                    pendingState.messageType, pendingState.content, pendingState.localOpMetadata);
                                break;
                            default:
                                // For all other message types, log an event indicating a resubmit was triggered for it.
                                this.logger.sendErrorEvent({
                                    eventName: "UnexpectedContainerResubmitMessage",
                                    messageType: pendingState.messageType,
                                });
                        }
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
