/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaStorageService, IDeltasFetchResult } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/**
 * Mock Document Delta Storage Service for testing
 */
export class MockDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(private readonly messages: ISequencedDocumentMessage[]) {
        this.messages = messages.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
    }

    public async get(from: number, to: number): Promise<IDeltasFetchResult> {
        const messages: ISequencedDocumentMessage[] = [];
        let index: number = 0;

        // Find first
        while (index < this.messages.length && this.messages[index].sequenceNumber <= from) {
            index++;
        }

        // start reading
        while (index < this.messages.length && this.messages[index].sequenceNumber < to) {
            messages.push(this.messages[index]);
            index++;
        }

        return { messages, partialResult: false };
    }
}
