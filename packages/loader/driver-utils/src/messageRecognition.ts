/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentMessage,
	IDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";

/**
 * @privateRemarks ADO #1385: To be moved to packages/protocol-base/src/protocol.ts
 * @internal
 */
export function canBeCoalescedByService(
	message: ISequencedDocumentMessage | IDocumentMessage,
): boolean {
	// This assumes that in the future relay service may implement coalescing of accept messages,
	// same way it was doing coalescing of immediate noops in the past.
	return message.type === MessageType.NoOp || message.type === MessageType.Accept;
}
