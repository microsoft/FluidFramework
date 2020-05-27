/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ErrorType, IGenericError } from "@fluidframework/container-definitions";
import { ErrorWithProps } from "@fluidframework/driver-utils";
import {
    MessageType,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import Deque from "double-ended-queue";
import { ContainerRuntime } from "./containerRuntime";

export class GenericMessageProcessingError extends ErrorWithProps implements IGenericError {
    readonly errorType = ErrorType.genericError;
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        readonly clientId: string,
        readonly sequenceNumber: number,
        readonly receivedClientSequenceNumber: number,
        readonly expectedClientSequenceNumber: number | undefined,
        readonly error: any = new Error(errorMessage),
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

    public isPendingState(): boolean {
        return !this.pendingStates.isEmpty();
    }

    constructor(
        private readonly containerRuntime: ContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) {}

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
        let flushMode: FlushMode | undefined;
        let pendingState = this.pendingStates.peekFront();

        // Remove all the "flush" states from the queue and get the first "message".
        while (pendingState?.type === "flush") {
            flushMode = pendingState.flushMode;
            this.pendingStates.shift();
            pendingState = this.pendingStates.peekFront();
        }

        // There should always be a pending message for a message for the local client. The clientSequenceNumber of the
        // incoming message must match that of the pending message.
        if (pendingState === undefined ||
            pendingState.type !== "message" ||
            pendingState.clientSequenceNumber !== message.clientSequenceNumber) {
            // Close the container because this indicates data corruption.
            const error = new GenericMessageProcessingError(
                "Unexpected ack received",
                message.clientId,
                message.sequenceNumber,
                message.clientSequenceNumber,
                pendingState?.type === "message" ? pendingState.clientSequenceNumber : undefined);

            this.containerRuntime.closeFn(error);
            return;
        }

        // Verify that the batch metadata, if any, is correct.
        this.verifyBatchMetadata(message, flushMode);

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        // Store this message as the last processed one.
        this.lastProcessedMessage = message;

        return pendingState.localOpMetadata;
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
