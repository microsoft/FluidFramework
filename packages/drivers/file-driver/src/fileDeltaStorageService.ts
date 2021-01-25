/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { assert } from "@fluidframework/common-utils";
import { IDocumentDeltaStorageService, IDeltasFetchResult } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";

/**
 * Provides access to the underlying delta storage on the local file storage for file driver.
 */
export class FileDeltaStorageService implements IDocumentDeltaStorageService {
    private readonly messages: api.ISequencedDocumentMessage[];
    private lastOps: api.ISequencedDocumentMessage[] = [];

    constructor(private readonly path: string) {
        this.messages = [];
        let counter = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const filename = `${this.path}//messages${counter === 0 ? "" : counter}.json`;
            if (!fs.existsSync(filename)) {
                if (counter === 0) {
                    throw new Error(`file ${filename} not found`);
                }
                break;
            }
            const data = fs.readFileSync(filename);
            this.messages = this.messages.concat(JSON.parse(data.toString("utf-8")));
            counter++;
        }
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<IDeltasFetchResult> {
        // Do not allow container move forward
        return { messages: [], end: true };
    }

    public get ops(): readonly Readonly<api.ISequencedDocumentMessage>[] {
        return this.messages;
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

        if (readFrom >= this.messages.length || readTo <= 0 || readFrom >= readTo) {
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
