/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

/**
 *
 * @param message-this is just
 * @returns
 */
export function isClientMessage(message: ISequencedDocumentMessage | IDocumentMessage) {
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

export function isRuntimeMessage(message: ISequencedDocumentMessage | IDocumentMessage) {
    return message.type === MessageType.Operation || message.type === MessageType.Summarize;
}
