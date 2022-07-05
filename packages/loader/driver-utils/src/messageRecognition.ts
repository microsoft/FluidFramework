/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

/**
 *
 * @param message-message
 * @returns whether or not the message type is one listed below
 * "op"
 * "summarize"
 * "propose"
 * "reject"
 * "noop"
 */
export function isClientMessage(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
    if (isRuntimeMessage(message)) {
        return true;
    }
    switch (message.type) {
        case MessageType.Propose:
        case MessageType.Reject:
        case MessageType.NoOp:
            return true;
        default:
            return false;
    }
}

/**
 *
 * @param message-message
 * @returns whether or not the message type is one listed below
 * "op"
 * "summarize"
 */
export function isRuntimeMessage(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
    return message.type === MessageType.Operation || message.type === MessageType.Summarize;
}

enum RuntimeMessage {
    FluidDataStoreOp = "component",
    Attach = "attach",
    ChunkedOp = "chunkedOp",
    BlobAttach = "blobAttach",
    Rejoin = "rejoin",
    Alias = "alias",
    Operation = "op",
}

/**
 *
 * @param message-message
 * @returns whether or not the message type is one listed below (legacy)
 * "component"
 * "attach"
 * "chunkedOp"
 * "blobAttach"
 * "rejoin"
 * "alias"
 * "op"
 */
export function isUnpackedRuntimeMessage(message: ISequencedDocumentMessage): boolean {
    if ((Object.values(RuntimeMessage) as string[]).includes(message.type)) {
        return true;
    }
    return false;
}
