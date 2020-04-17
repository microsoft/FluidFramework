/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import { IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Provides access to the underlying delta storage on the local file storage for file driver.
 */
export class FileDeltaStorageService implements IDocumentDeltaStorageService {
    private readonly messages: api.ISequencedDocumentMessage[];
    private lastOps: api.ISequencedDocumentMessage[] = [];

    constructor(private readonly path: string) {
        const data = fs.readFileSync(`${this.path}//messages.json`);
        this.messages = JSON.parse(data.toString("utf-8"));
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        // Do not allow container move forward
        return [];
    }

    /**
     * Retrieve ops within the exclusive sequence number range.
     *
     * @param from - First op to be fetched.
     * @param to - Last op to be fetched. This is exclusive.
     */
    public getFromWebSocket(from: number, to: number): api.ISequencedDocumentMessage[] {
        const readFrom = Math.max(from, 0); // Inclusive
        const readTo = Math.min(to, this.messages.length); // Exclusive

        if (readFrom >= this.messages.length || readTo <= 0) {
            return [];
        }

        // Optimizations for multiple readers (replay tool)
        if (this.lastOps.length > 0 && this.lastOps[0].sequenceNumber === readFrom + 1) {
            return this.lastOps;
        }
        this.lastOps = this.messages.slice(readFrom, readTo);
        assert(this.lastOps[0].sequenceNumber === readFrom + 1);
        return this.lastOps;
    }
}
