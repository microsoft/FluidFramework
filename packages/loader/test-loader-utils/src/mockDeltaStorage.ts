/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentDeltaStorageService, IStream } from "@fluidframework/driver-definitions/internal";
import { streamFromMessages } from "@fluidframework/driver-utils/internal";

/**
 * Mock Document Delta Storage Service for testing.
 *
 * @internal
 */
export class MockDocumentDeltaStorageService implements IDocumentDeltaStorageService {
	constructor(private readonly messages: ISequencedDocumentMessage[]) {
		this.messages = messages.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
	}

	public fetchMessages(
		from: number, // inclusive
		to: number | undefined, // exclusive
		abortSignal?: AbortSignal,
		cachedOnly?: boolean,
	): IStream<ISequencedDocumentMessage[]> {
		return streamFromMessages(this.getCore(from, to));
	}

	private async getCore(from: number, to?: number) {
		const messages: ISequencedDocumentMessage[] = [];
		let index: number = 0;

		// Find first
		let message = this.messages[index];
		assert(
			message !== undefined,
			"message is undefined in MockDocumentDeltaStorageService.getCore",
		);
		while (index < this.messages.length && message.sequenceNumber < from) {
			index++;
		}

		// start reading
		while (index < this.messages.length && (to === undefined || message.sequenceNumber < to)) {
			messages.push(message);
			index++;
		}

		return messages;
	}
}
