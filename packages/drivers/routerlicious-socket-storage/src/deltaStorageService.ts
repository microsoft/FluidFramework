/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@microsoft/fluid-core-utils";
import { IDeltaStorageService, IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import Axios from "axios";
import * as querystring from "querystring";
import { TokenProvider } from "./tokens";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly tokenProvider: api.ITokenProvider,
        private readonly storageService: IDeltaStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, this.tokenProvider, from, to);
    }
}

/**
 * Provides access to the underlying delta storage on the server for routerlicious driver.
 */
export class DeltaStorageService implements IDeltaStorageService {
    constructor(private readonly url: string) {
    }

    public async get(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        let headers: {Authorization: string} | null = null;

        const token = (tokenProvider as TokenProvider).token;

        if (token) {
            headers = {
                Authorization: `Basic ${fromUtf8ToBase64(`${tenantId}:${token}`)}`,
            };
        }

        const opPromise = Axios.get<api.ISequencedDocumentMessage[]>(
            `${this.url}?${query}`, { headers });

        const contentPromise = Axios.get<any[]>(
            `${this.url}/content?${query}`, { headers });

        const [opData, contentData] = await Promise.all([opPromise, contentPromise]);

        const contents = contentData.data;
        const ops = opData.data;
        let contentIndex = 0;
        for (const op of ops) {
            if (op.contents === undefined) {
                assert.ok(contentIndex < contents.length, "Delta content not found");
                const content = contents[contentIndex];
                // tslint:disable-next-line: no-unsafe-any
                assert.equal(op.sequenceNumber, content.sequenceNumber, "Invalid delta content order");
                // tslint:disable-next-line: no-unsafe-any
                op.contents = content.op.contents;
                ++contentIndex;
            }
        }

        return ops;
    }
}
