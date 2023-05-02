/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

export type IMessageWithServerMetadata<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
> = T & {
	serverMetadata?: { createSignal?: boolean; noClient?: boolean; deliAcked?: boolean };
};

export function hasValidServerMetadata<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
>(msg: T | undefined): msg is IMessageWithServerMetadata<T> {
	if (
		msg !== undefined &&
		(msg.serverMetadata === undefined || typeof msg?.serverMetadata === "object")
	) {
		return true;
	}
	return false;
}
