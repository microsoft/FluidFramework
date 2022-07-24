/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

// ADO #1385: staging code changes across layers.
// Eventually to be replaced by MessageType.accept
export enum MessageType2 {
    Accept = "accept",
}

// ADO #1385: To be moved to packages/protocol-base/src/protocol.ts
export function canBeCoalescedByService(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
    // This assumes that in the future rely service may implement coalescing of accept messages,
    // same way it was doing coalescing of immediate noops in the past.
    return message.type === MessageType.NoOp || message.type === MessageType2.Accept;
}

/**
 * Tells if message was sent by container runtime
 * // ADO #1385: To be moved to container-definitions
 * @param message-message
 * @returns whether or not the message type is one listed below
 * "op"
 */
export function isRuntimeMessage(message: { type: string; }): boolean {
    return message.type === MessageType.Operation;
}
