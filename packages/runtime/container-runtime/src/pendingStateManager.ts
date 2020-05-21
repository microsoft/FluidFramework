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
        while (this.pendingStates.peekFront()?.type === "flush") {
            this.pendingStates.shift();
        }

        const firstPendingMessage = this.pendingStates.peekFront() as IPendingMessage;

        // There should always be a pending message for a message for the local client. The clientSequenceNumber of the
        // incoming message must match that of the pending message.
        if (firstPendingMessage?.clientSequenceNumber !== message.clientSequenceNumber) {
            this.logger.sendErrorEvent({
                eventName: "UnexpectedAckReceived",
                clientId: message.clientId,
                sequenceNumber: message.sequenceNumber,
                expectedClientSequenceNumber: firstPendingMessage?.clientSequenceNumber,
                receivedClientSequenceNumber: message.clientSequenceNumber,
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

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        return firstPendingMessage.localOpMetadata;
    }

    private replayPendingStates() {
        const pendingstates = this.pendingStates.toArray();
        this.pendingStates.clear();

        // Save the current FlushMode so that we can revert it back after replaying the states.
        const savedFlushMode = this.containerRuntime.flushMode;
        for (const pendingState of pendingstates) {
            switch (pendingState.type) {
                case "flush":
                    {
                        this.containerRuntime.setFlushMode(pendingState.flushMode);
                    }
                    break;
                case "message":
                    {
                        // For messages of type Operation, call reSubmit which will find the right component and trigger
                        // resubmission on it.
                        // For all other messages, just submit it again.
                        if (pendingState.messageType === MessageType.Operation) {
                            this.containerRuntime.reSubmitFn(pendingState.content, pendingState.localOpMetadata);
                        } else {
                            this.containerRuntime.submitFn(
                                pendingState.messageType, pendingState.content, pendingState.localOpMetadata);
                        }
                    }
                    break;
                default:
                    break;
            }
        }
        // Revert the FlushMode.
        this.containerRuntime.setFlushMode(savedFlushMode);
    }
}
