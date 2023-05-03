/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
} from "@fluidframework/protocol-definitions";

export const opSize = (op: ISequencedDocumentMessage): number => {
	// Some messages may already have string contents,
	// so stringifying them again will add inaccurate overhead.
	const content =
		typeof op.contents === "string" ? op.contents : JSON.stringify(op.contents) ?? "";
	const data = opHasData(op) ? op.data : "";
	return content.length + data.length;
};

const opHasData = (op: ISequencedDocumentMessage): op is ISequencedDocumentSystemMessage =>
	(op as ISequencedDocumentSystemMessage).data !== undefined;

export type IRuntimeMessageWithMetadata<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
> = T & {
	metadata?: {
		batch?: boolean;
		blobId?: string;
		localId?: string;
		compressed?: undefined;
	};
};
export function isMessageWithValidMetadata<T extends ISequencedDocumentMessage | IDocumentMessage>(
	message: T | undefined,
): message is IRuntimeMessageWithMetadata<T> {
	if (typeof message?.metadata === "object" && message.metadata !== null) {
		return true;
	}
	return false;
}

export function asMessageWithMetadata<T extends ISequencedDocumentMessage | IDocumentMessage>(
	message: T | undefined,
): IRuntimeMessageWithMetadata<T> | undefined {
	return isMessageWithValidMetadata(message) ? message : undefined;
}

export function assertMessageWithValidMetadata<
	T extends ISequencedDocumentMessage | IDocumentMessage,
>(message: T | undefined): asserts message is IRuntimeMessageWithMetadata<T> {
	assert(isMessageWithValidMetadata(message), "message does not have valid metadata");
}

export type IRuntimeMessageWithContents<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
> = T & {
	contents?: { type?: string; address?: string; contents?: unknown };
};

export function asMessageWithValidContents<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
>(message: T | undefined): IRuntimeMessageWithContents<T> | undefined {
	return isMessageWithValidContents(message) ? message : undefined;
}

export function isMessageWithValidContents<
	T extends ISequencedDocumentMessage | IDocumentMessage = ISequencedDocumentMessage,
>(message: T | undefined): message is IRuntimeMessageWithContents<T> {
	if (typeof message?.contents === "object" && message.contents !== null) {
		return true;
	}
	return false;
}

export function assertMessageWithValidContents<
	T extends ISequencedDocumentMessage | IDocumentMessage,
>(message: T | undefined): asserts message is IRuntimeMessageWithContents<T> {
	assert(isMessageWithValidContents(message), "message does not have valid contents");
}
