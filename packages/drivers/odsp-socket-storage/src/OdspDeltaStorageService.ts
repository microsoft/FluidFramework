/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-protocol-definitions";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { IFetchWrapper } from "./fetchWrapper";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { getWithRetryForTokenRefresh } from "./OdspUtils";

/**
 * Provides access to the underlying delta storage on the server for sharepoint driver.
 */
export class OdspDeltaStorageService implements api.IDocumentDeltaStorageService {
    private readonly queryString: string;

    constructor(
        queryParams: { [key: string]: string },
        private readonly deltaFeedUrlProvider: () => Promise<string>,
        private readonly fetchWrapper: IFetchWrapper,
        private ops: ISequencedDeltaOpMessage[] | undefined,
        private readonly getStorageToken: (refresh: boolean) => Promise<string | null>,
    ) {
        this.queryString = getQueryString(queryParams);
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        const ops = this.ops;
        this.ops = undefined;
        if (ops !== undefined && from !== undefined) {
            return ops.filter((op) => op.sequenceNumber > from).map((op) => op.op);
        }
        this.ops = undefined;

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            // Note - this call ends up in getSocketStorageDiscovery() and can refresh token
            // Thus it needs to be done before we call getStorageToken() to reduce extra calls
            const baseUrl = await this.buildUrl(from, to);

            const storageToken = await this.getStorageToken(refresh);

            const { url, headers } = getUrlAndHeadersWithAuth(baseUrl, storageToken);

            const response = await this.fetchWrapper.get<IDeltaStorageGetResponse>(url, url, headers);
            const deltaStorageResponse = response.content;

            const operations: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[] = deltaStorageResponse.value;
            if (operations.length > 0 && "op" in operations[0]) {
                return (operations as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
            }

            return operations as api.ISequencedDocumentMessage[];
        });
    }

    public async buildUrl(from: number | undefined, to: number | undefined) {
        const fromInclusive = from === undefined ? undefined : from + 1;
        const toInclusive = to === undefined ? undefined : to - 1;

        const filter = encodeURIComponent(`sequenceNumber ge ${fromInclusive} and sequenceNumber le ${toInclusive}`);
        const fullQueryString = `${(this.queryString ? `${this.queryString}&` : "?")}filter=${filter}`;
        return `${await this.deltaFeedUrlProvider()}${fullQueryString}`;
    }
}
