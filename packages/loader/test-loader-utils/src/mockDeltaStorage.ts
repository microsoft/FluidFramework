/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaStorageService, IOpResult } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/**
 * Mock Document Delta Storage Service for testing
 */
export class MockDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(private readonly messages: ISequencedDocumentMessage[]) {
        this.messages = messages.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
    }

    public async get(from?: number, to?: number): Promise<IOpResult> {
        const messages: ISequencedDocumentMessage[] = [];
        let index: number = -1;

        // Find first
        if (from !== undefined) {
            while (this.messages[++index].sequenceNumber <= from) { }
        }

        // start reading
        while (++index < this.messages.length && (to === undefined || this.messages[++index].sequenceNumber < to)) {
            messages.push(this.messages[index]);
        }

        return { messages, end: true };
    }
}
