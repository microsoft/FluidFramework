/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import querystring from "querystring";
import { fromUtf8ToBase64 } from "@microsoft/fluid-common-utils";
import { IDeltaStorageService, IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import api from "@microsoft/fluid-protocol-definitions";
import Axios from "axios";
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

    public async get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
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

        let headers: { Authorization: string } | null = null;

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
                assert.equal(op.sequenceNumber, content.sequenceNumber, "Invalid delta content order");
                op.contents = content.op.contents;
                ++contentIndex;
            }
        }

        return ops;
    }
}
