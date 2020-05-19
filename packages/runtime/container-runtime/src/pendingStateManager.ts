/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
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
    metadata: unknown;
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

    constructor(
        private readonly containerRuntime: ContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) {}

    public addFlushMode(flushMode: FlushMode) {
        const pendingFlushMode: IPendingFlushMode = {
            type: "flush",
            flushMode,
        };

        this.pendingStates.push(pendingFlushMode);
    }

    public addMessage(type: MessageType, clientSequenceNumber: number, content: any, metadata: unknown) {
        const pendingMessage: IPendingMessage = {
            type: "message",
            messageType: type,
            clientSequenceNumber,
            content,
            metadata,
        };

        this.pendingStates.push(pendingMessage);
    }

    public replayPendingStates() {
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
                        // For messages of type Operation, call resubmit which will find the right component and trigger
                        // resubmission on it.
                        // For all other messages, just submit it again.
                        if (pendingState.messageType === MessageType.Operation) {
                            this.containerRuntime.reSubmitFn(pendingState.content, pendingState.metadata);
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

    public processPendingMessage(message: ISequencedDocumentMessage): unknown {
        const pendingState = this.pendingStates.peekFront();
        if (pendingState === undefined) {
            this.logger.sendErrorEvent({ eventName: "UnexpectedAckReceived" });
            return;
        }

        if (pendingState.type === "flush") {
            this.pendingStates.shift();
            return this.processPendingMessage(message);
        }

        // Disconnected ops should never be processed. They should have been fully sent on connected.
        assert(pendingState.clientSequenceNumber !== -1,
            `processing disconnected op ${pendingState.clientSequenceNumber}`);

        // Messages should always be received in the same order in which they are sent.
        if (pendingState.clientSequenceNumber !== message.clientSequenceNumber) {
            this.logger.sendErrorEvent({ eventName: "WrongAckReceived" });
            return;
        }

        // Remove the first message from the pending list since it has been acknowledged.
        this.pendingStates.shift();

        return pendingState.metadata;
    }
}
