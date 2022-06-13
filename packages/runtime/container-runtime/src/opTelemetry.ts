/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
} from "@fluidframework/protocol-definitions";
import { isRuntimeMessage } from "@fluidframework/driver-utils";

export class OpTracker {
    /**
     * Used for storing the message content size when
     * the message is pushed onto the inbound queue.
     */
    private readonly messageSize = new Map<number, number>();
    private _nonSystemOpCount: number = 0;
    public get nonSystemOpCount(): number {
        return this._nonSystemOpCount;
    }

    private _opsSizeAccumulator: number = 0;
    public get opsSizeAccumulator(): number {
        return this._opsSizeAccumulator;
    }

    public constructor(
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        disabled: boolean,
    ) {
        if (disabled) {
            return;
        }

        // Record the message content size when we receive it.
        // We should not log this value, as summarization can happen between the time the message
        // is received and until it is processed (the 'op' event).
        deltaManager.inbound.on("push", (message: ISequencedDocumentMessage) => {
            // Some messages my already have string contents at this point,
            // so stringifying them again will add inaccurate overhead.
            const messageContent = typeof message.contents === "string" ?
                message.contents :
                JSON.stringify(message.contents);
            const messageData = OpTracker.messageHasData(message) ? message.data : "";
            this.messageSize[OpTracker.messageId(message)] = messageContent.length + messageData.length;
        });

        deltaManager.on("op", (message: ISequencedDocumentMessage) => {
            this._nonSystemOpCount += !isRuntimeMessage(message) ? 0 : 1;
            const id = OpTracker.messageId(message);
            this._opsSizeAccumulator += this.messageSize[id] ?? 0;
            this.messageSize.delete(id);
        });
    }

    private static messageId(message: ISequencedDocumentMessage): number {
        return message.sequenceNumber;
    }

    private static messageHasData(message: ISequencedDocumentMessage): message is ISequencedDocumentSystemMessage {
        return (message as ISequencedDocumentSystemMessage).data !== undefined;
    }

    public reset() {
        this._nonSystemOpCount = 0;
        this._opsSizeAccumulator = 0;
    }
}
