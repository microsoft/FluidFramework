/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "..";
import { OpDecompressor } from "../opDecompressor";
import { OpSplitter } from "./opSplitter";

export interface IRemoteMessageResult {
    readonly processedMessage: ISequencedDocumentMessage;
    readonly wasUnpacked: boolean;
}

export class Inbox {
    constructor(
        private readonly opSplitter: OpSplitter,
        private readonly opDecompressor: OpDecompressor,
    ) { }

    public get hasPartialMessages(): boolean {
        return this.opSplitter.hasChunks;
    }

    public get partialMessages(): ReadonlyMap<string, string[]> {
        return this.opSplitter.chunks;
    }

    public clearPartialMessagesFor(clientId: string) {
        this.opSplitter.clearPartialChunks(clientId);
    }

    public process(remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage {
        const message = this.opSplitter.processIncoming(this.prepare(remoteMessage));
        if (remoteMessage.type === ContainerMessageType.ChunkedOp) {
            return message;
        }

        return this.unpack(this.opDecompressor.processMessage(message));
    }

    private prepare(remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage {
        // Do shallow copy of message, as methods below will modify it.
        // There might be multiple container instances receiving same message
        // We do not need to make deep copy, as each layer will just replace message.content itself,
        // but would not modify contents details
        const message = { ...remoteMessage };

        // back-compat: ADO #1385: eventually should become unconditional, but only for runtime messages!
        // System message may have no contents, or in some cases (mostly for back-compat) they may have actual objects.
        // Old ops may contain empty string (I assume noops).
        if (typeof message.contents === "string" && message.contents !== "") {
            message.contents = JSON.parse(message.contents);
        }

        return message;
    }

    private unpack(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
        if (message.type !== MessageType.Operation) {
            // Legacy format, but it's already "unpacked",
            // i.e. message.type is actually ContainerMessageType.
            // Or it's non-runtime message.
            // Nothing to do in such case.
            return message;
        }

        // legacy op format?
        if (message.contents.address !== undefined && message.contents.type === undefined) {
            message.type = ContainerMessageType.FluidDataStoreOp;
        } else {
            // new format
            const innerContents = message.contents as ContainerRuntimeMessage;
            message.type = innerContents.type;
            message.contents = innerContents.contents;
        }

        return message;
    }
}

