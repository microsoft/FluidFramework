/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import querystring from "querystring";
import { assert, fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { IDeltaStorageService, IDocumentDeltaStorageService } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";
import Axios from "axios";
import { ITokenProvider } from "./tokens";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly storageService: IDeltaStorageService) {
    }

    public async get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, from, to);
    }
}

/**
 * Provides access to the underlying delta storage on the server for routerlicious driver.
 */
export class DeltaStorageService implements IDeltaStorageService {
    constructor(private readonly url: string, private readonly tokenProvider: ITokenProvider) {
    }

    public async get(
        tenantId: string,
        id: string,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        let headers: { Authorization: string } | null = null;

        const storageToken = await this.tokenProvider.fetchStorageToken();

        if (storageToken) {
            headers = {
                Authorization: `Basic ${fromUtf8ToBase64(`${tenantId}:${storageToken.jwt}`)}`,
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
                assert(contentIndex < contents.length, "Delta content not found");
                const content = contents[contentIndex];
                assert(op.sequenceNumber === content.sequenceNumber, "Invalid delta content order");
                op.contents = content.op.contents;
                ++contentIndex;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return ops;
    }
}
