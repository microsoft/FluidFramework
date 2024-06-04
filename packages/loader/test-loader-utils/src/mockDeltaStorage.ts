/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
		while (index < this.messages.length && this.messages[index].sequenceNumber < from) {
			index++;
		}

		// start reading
		while (
			index < this.messages.length &&
			(to === undefined || this.messages[index].sequenceNumber < to)
		) {
			messages.push(this.messages[index]);
			index++;
		}

		return messages;
	}
}
