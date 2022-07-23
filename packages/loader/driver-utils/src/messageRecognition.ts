/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

// back-compat: staging code changes across layers.
// Eventually to be replaced by MessageType.accept
export enum MessageType2 {
    Accept = "accept",
}

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
        case MessageType.Summarize:
        case MessageType2.Accept:
            return true;
        default:
            return false;
    }
}

export function canBeCoalescedByService(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
    // This assumes that in the future rely service may implement coalescing of accept messages,
    // same way it was doing coalescing of immediate noops in the past.
    return message.type === MessageType.NoOp || message.type === MessageType2.Accept;
}

/**
 *
 * @param message-message
 * @returns whether or not the message type is one listed below
 * "op"
 */
export function isRuntimeMessage(message: { type: string; }): boolean {
    return message.type === MessageType.Operation;
}
