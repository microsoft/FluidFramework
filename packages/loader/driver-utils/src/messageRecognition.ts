/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

export function isClientMessage(message: ISequencedDocumentMessage | IDocumentMessage) {
    switch (message.type) {
        case MessageType.Propose:
        case MessageType.Reject:
        case MessageType.NoOp:
        case MessageType.Summarize:
        case MessageType.Operation:
            return true;
        default:
            return false;
    }
}

export function isRuntimeMessage(message: ISequencedDocumentMessage | IDocumentMessage) {
    return message.type === MessageType.Operation || message.type === MessageType.Summarize;
}
