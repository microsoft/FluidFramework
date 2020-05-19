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

export class PendingStateHandler {
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

        // Disconnected ops should never be processed. They should have been fully sent on connected
        assert(pendingState.clientSequenceNumber !== -1,
            `processing disconnected op ${pendingState.clientSequenceNumber}`);

        // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
        // in order we only need to check the beginning of the local list.
        if (pendingState.clientSequenceNumber !== message.clientSequenceNumber) {
            this.logger.sendErrorEvent({ eventName: "WrongAckReceived" });
            return;
        }

        this.pendingStates.shift();

        return pendingState.metadata;
    }
}
