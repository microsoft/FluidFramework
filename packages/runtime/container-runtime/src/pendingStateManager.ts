/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { ErrorType, IGeneralError } from "@microsoft/fluid-driver-definitions";
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
        const pendingState = this.pendingStates.peekFront();

        // There should always be a pending message for local messages. If not, there might be data corruption. Log an
        // error and close the Container.
        if (pendingState === undefined) {
            this.logger.sendErrorEvent({ eventName: "UnexpectedAckReceived" });
            this.closeContainer("Unxpected ack received");
            return;
        }

        if (pendingState.type === "flush") {
            this.pendingStates.shift();
            return this.processPendingLocalMessage(message);
        }

        const firstPendingMessage = pendingState;

        // Disconnected ops should never be processed. They should have been fully sent on connected. If not, there
        // might be data corruption. Log an error and close the Container.
        if (firstPendingMessage.clientSequenceNumber === -1) {
            this.logger.sendErrorEvent({ eventName: "ProcessingDisconnectedOp" });
            this.closeContainer("Processing disconnected op");
            return;
        }

        // Messages should always be received in the same order in which they are sent. If not, there might be data
        // corruption. Log an error and close the Container.
        if (firstPendingMessage.clientSequenceNumber === message.clientSequenceNumber) {
            this.logger.sendErrorEvent({
                eventName: "WrongAckReceived",
                expectedClientSequenceNumber: firstPendingMessage.clientSequenceNumber,
                receivedClientSequenceNumber: message.clientSequenceNumber,
            });
            this.closeContainer("Ack received with wrong clientSequenceNumber");
            return;
        }

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        return firstPendingMessage.localOpMetadata;
    }

    private closeContainer(errorMessage: string) {
        const error: IGeneralError = {
            errorType: ErrorType.generalError,
            error: new Error(errorMessage),
            critical: true,
        };
        this.containerRuntime.closeFn(error);
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
                            this.containerRuntime.submitFn(pendingState.messageType, pendingState.content);
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
