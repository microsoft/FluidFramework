/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { OpDecompressor } from "./opDecompressor";
import { OpUnpacker } from "./opUnpacker";
import { OpSplitter } from "./opSplitter";

export interface IProcessingResult {
    readonly message: ISequencedDocumentMessage;
    readonly state: "Processed" | "Skipped" | "NotReady";
}

export interface IRemoteMessageProcessor {
    processRemoteMessage(remoteMessage: ISequencedDocumentMessage): IProcessingResult;
}

export class Inbox {
    constructor(
        private readonly opSplitter: OpSplitter,
        private readonly opDecompressor: OpDecompressor,
        private readonly opUnpacker: OpUnpacker,
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
        const message = this.prepare(remoteMessage);
        const decompressionResult = this.opDecompressor.processRemoteMessage(message);
        const unpackResult = this.opUnpacker.processRemoteMessage(decompressionResult.message);

        const unchunkResult = this.opSplitter.processRemoteMessage(unpackResult.message);
        if (unchunkResult.state !== "Processed") {
            return unchunkResult.message;
        }

        const maybeDecompressedResult = this.opDecompressor.processRemoteMessage(unchunkResult.message);
        if (maybeDecompressedResult.state === "Skipped") {
            return maybeDecompressedResult.message;
        }

        return maybeDecompressedResult.message;
    }

    private prepare(remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage {
        // Do shallow copy of message, as the processing flow will modify it.
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
}

