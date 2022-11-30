/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "../containerRuntime";
import { OpDecompressor } from "./opDecompressor";
import { OpSplitter } from "./opSplitter";

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
        const message = copy(remoteMessage);
        this.opDecompressor.processMessage(message);
        unpackRuntimeMessage(message);

        if (message.type !== ContainerMessageType.ChunkedOp) {
            // If the op is not chunked, we can return early
            return message;
        }

        if (!this.opSplitter.processRemoteMessage(message)) {
            // If we're still building a chunked message and we haven't received all the chunks yet
            // there is no point in continuing further
            return message;
        }

        if (!this.opDecompressor.processMessage(message)) {
            // After chunking, the op may be compressed. If it is not, we can return it
            return message;
        }

        const innerContents = message.contents as ContainerRuntimeMessage;
        message.type = innerContents.type;
        message.contents = innerContents.contents;
        return message;
    }
}

const copy = (remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage => {
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
};


/**
 * Unpacks runtime messages.
 *
 * @remarks This API makes no promises regarding backward-compatibility. This is internal API.
 * @param message - message (as it observed in storage / service)
 * @returns unpacked runtime message
 *
 * @internal
 */
export function unpackRuntimeMessage(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Operation) {
        // legacy op format?
        if (message.contents.address !== undefined && message.contents.type === undefined) {
            message.type = ContainerMessageType.FluidDataStoreOp;
        } else {
            // new format
            const innerContents = message.contents as ContainerRuntimeMessage;
            message.type = innerContents.type;
            message.contents = innerContents.contents;
        }
        return true;
    } else {
        // Legacy format, but it's already "unpacked",
        // i.e. message.type is actually ContainerMessageType.
        // Or it's non-runtime message.
        // Nothing to do in such case.
        return false;
    }
}
