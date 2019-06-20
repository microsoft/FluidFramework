/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as fs from "fs";

/**
 * Provides access to the underlying delta storage on the local file storage for file driver.
 */
export class FileDeltaStorageService implements api.IDocumentDeltaStorageService {

    private readonly messages: api.ISequencedDocumentMessage[];
    private isGetCalledFirstTime = true;
    constructor(private readonly path: string) {
        const data = fs.readFileSync(`${this.path}//messages.json`);
        this.messages = JSON.parse(data.toString("utf-8"));
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        if (this.isGetCalledFirstTime === true) {
            this.isGetCalledFirstTime = false;
            return this.getCore(false, from, to);
        } else {
            return this.getCore(true, from, to === undefined ? undefined : to - 1);
        }
    }

    /**
     * Retrieve ops within the exclusive sequence number range.
     *
     * @param from - First op to be fetched.
     * @param to - Last op to be fetched. This is exclusive.
     */
    public async getFromWebSocket(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        return this.getCore(true, from, to);
    }

    private async getCore(
        isFromWebSocket: boolean,
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        const readFrom = from === undefined ? 0 : Math.max(from, 0); // inclusive
        const readTo = to === undefined ? this.messages.length : Math.min(to, this.messages.length); // exclusive

        if (isFromWebSocket === false || readFrom >= this.messages.length || readTo <= 0) {
            return [];
        }

        return this.messages.slice(readFrom, readTo);
    }
}
