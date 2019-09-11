/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/protocol-definitions";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { IFetchWrapper } from "./fetchWrapper";
import { getQueryString } from "./getQueryString";
import { TokenProvider } from "./tokenProvider";
import { getWithRetryForTokenRefresh } from "./utils";

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
        private readonly getTokenProvider: (refresh: boolean) => Promise<api.ITokenProvider>,
    ) {
        this.queryString = getQueryString(queryParams);
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        if (this.ops !== undefined && from) {
            const returnOps = this.ops;
            this.ops = undefined;

            return returnOps.filter((op) => op.sequenceNumber > from).map((op) => op.op);
        }
        this.ops = undefined;

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            const tokenProvider = await this.getTokenProvider(refresh);

            const { url, headers } = (tokenProvider as TokenProvider).getUrlAndHeadersWithAuth(await this.buildUrl(from, to));

            const response = await this.fetchWrapper.get<IDeltaStorageGetResponse>(url, url, headers);

            const operations: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[] = response.value;
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
