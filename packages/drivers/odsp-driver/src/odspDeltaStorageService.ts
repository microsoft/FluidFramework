/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import * as api from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchHelper, getWithRetryForTokenRefresh } from "./odspUtils";
import { TokenFetchOptions } from "./tokenFetch";

/**
 * Provides access to the underlying delta storage on the server for sharepoint driver.
 */
export class OdspDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private readonly deltaFeedUrlProvider: () => Promise<string>,
        private ops: ISequencedDeltaOpMessage[] | undefined,
        private readonly getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
        private readonly logger?: ITelemetryLogger,
    ) {
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<ISequencedDocumentMessage[]> {
        const ops = this.ops;
        this.ops = undefined;
        if (ops !== undefined && from !== undefined) {
            return ops.filter((op) => op.sequenceNumber > from).map((op) => op.op);
        }
        this.ops = undefined;

        return getWithRetryForTokenRefresh(async (options) => {
            // Note - this call ends up in getSocketStorageDiscovery() and can refresh token
            // Thus it needs to be done before we call getStorageToken() to reduce extra calls
            const baseUrl = await this.buildUrl(from, to);

            const storageToken = await this.getStorageToken(options, "DeltaStorage");

            const { url, headers } = getUrlAndHeadersWithAuth(baseUrl, storageToken);

            const response = await fetchHelper<IDeltaStorageGetResponse>(url, { headers });
            const deltaStorageResponse = response.content;
            if (this.logger) {
                this.logger.sendTelemetryEvent({
                    eventName: "DeltaStorageOpsFetch",
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    sprequestguid: response.headers.get("sprequestguid"),
                    sprequestduration: response.headers.get("sprequestduration"),
                });
            }
            const operations: ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[] = deltaStorageResponse.value;
            if (operations.length > 0 && "op" in operations[0]) {
                return (operations as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
            }

            return operations as ISequencedDocumentMessage[];
        });
    }

    public async buildUrl(from: number | undefined, to: number | undefined) {
        const fromInclusive = from === undefined ? undefined : from + 1;
        const toInclusive = to === undefined ? undefined : to - 1;

        const filter = encodeURIComponent(`sequenceNumber ge ${fromInclusive} and sequenceNumber le ${toInclusive}`);
        const queryString = `?filter=${filter}`;
        return `${await this.deltaFeedUrlProvider()}${queryString}`;
    }
}
