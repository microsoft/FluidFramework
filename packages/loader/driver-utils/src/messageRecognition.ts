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
        case MessageType2.Accept:
        case MessageType.Summarize:
            return true;
        default:
            return false;
    }
}

/**
 * Tells if message was sent by container runtime
 * // ADO #1385: To be moved to container-definitions
 * @param message-message
 * @returns whether the message is a runtime message
 */
export function isRuntimeMessage(message: { type: string; }): boolean {
    return message.type === MessageType.Operation;
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
 * @deprecated - this API should not be used!
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

// ADO #1385: staging code changes across layers.
// Eventually to be replaced by MessageType.accept
export enum MessageType2 {
    Accept = "accept",
}

// ADO #1385: To be moved to packages/protocol-base/src/protocol.ts
export function canBeCoalescedByService(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
    // This assumes that in the future relay service may implement coalescing of accept messages,
    // same way it was doing coalescing of immediate noops in the past.
    return message.type === MessageType.NoOp || message.type === MessageType2.Accept;
}
