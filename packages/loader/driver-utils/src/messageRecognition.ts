/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentMessage, MessageType } from "@fluidframework/driver-definitions/internal";

/**
 * Tells if message was sent by container runtime
 * @privateRemarks ADO #1385: To be moved to container-definitions
 * @returns whether the message is a runtime message
 * @internal
 */
export function isRuntimeMessage(message: { type: string }): boolean {
	return message.type === MessageType.Operation;
}

/**
 * @privateRemarks ADO #1385: staging code changes across layers.
 * Eventually to be replaced by MessageType.accept
 * @internal
 */
export enum MessageType2 {
	Accept = "accept",
}

/**
 * @privateRemarks ADO #1385: To be moved to packages/protocol-base/src/protocol.ts
 * @internal
 */
export function canBeCoalescedByService(
	message: ISequencedDocumentMessage | IDocumentMessage,
): boolean {
	// This assumes that in the future relay service may implement coalescing of accept messages,
	// same way it was doing coalescing of immediate noops in the past.
	return message.type === MessageType.NoOp || message.type === MessageType2.Accept;
}
