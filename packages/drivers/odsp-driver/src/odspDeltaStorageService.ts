/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import * as api from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { TokenFetchOptions } from "@fluidframework/odsp-driver-definitions";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { EpochTracker } from "./epochTracker";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { getWithRetryForTokenRefresh } from "./odspUtils";

/**
 * Provides access to the underlying delta storage on the server for sharepoint driver.
 */
export class OdspDeltaStorageService {
    constructor(
        private readonly deltaFeedUrl: string,
        private readonly getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
        private readonly epochTracker: EpochTracker,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    public async get(
        from: number,
        to: number,
    ): Promise<api.IDeltasFetchResult> {
        return getWithRetryForTokenRefresh(async (options) => {
            // Note - this call ends up in getSocketStorageDiscovery() and can refresh token
            // Thus it needs to be done before we call getStorageToken() to reduce extra calls
            const baseUrl = await this.buildUrl(from, to);

            const storageToken = await this.getStorageToken(options, "DeltaStorage");

            const { url, headers } = getUrlAndHeadersWithAuth(baseUrl, storageToken);

            const response = await this.epochTracker
                .fetchAndParseAsJSON<IDeltaStorageGetResponse>(url, { headers }, "ops");
            const deltaStorageResponse = response.content;
            let messages: ISequencedDocumentMessage[];
            if (deltaStorageResponse.value.length > 0 && "op" in deltaStorageResponse.value[0]) {
                messages = (deltaStorageResponse.value as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
            } else {
                messages = deltaStorageResponse.value as ISequencedDocumentMessage[];
            }

            this.logger.sendPerformanceEvent({
                eventName: "DeltaStorageOpsFetch",
                headers: Object.keys(headers).length !== 0 ? true : undefined,
                count: messages.length,
                duration: response.duration, // this duration for single attempt!
                ...response.commonSpoHeaders,
                attempts: options.refresh ? 2 : 1,
            });

            // It is assumed that server always returns all the ops that it has in the range that was requested.
            // This may change in the future, if so, we need to adjust and receive "end" value from server in such case.
            return { messages, partialResult: false };
        });
    }

    public async buildUrl(from: number, to: number) {
        const filter = encodeURIComponent(`sequenceNumber ge ${from} and sequenceNumber le ${to - 1}`);
        const queryString = `?filter=${filter}`;
        return `${this.deltaFeedUrl}${queryString}`;
    }
}
