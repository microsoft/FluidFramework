/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { TokenFetchOptions } from "@fluidframework/odsp-driver-definitions";
import { IDeltasFetchResult, IDocumentDeltaStorageService } from "@fluidframework/driver-definitions";
import {
    requestOps,
    streamObserver,
} from "@fluidframework/driver-utils";
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
    ): Promise<IDeltasFetchResult> {
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

export class OdspDeltaStorageWithCache implements IDocumentDeltaStorageService {
    private firstCacheMiss = Number.MAX_SAFE_INTEGER;

    public constructor(
        private snapshotOps: ISequencedDeltaOpMessage[] | undefined,
        private readonly service: OdspDeltaStorageService,
        private readonly logger: ITelemetryLogger,
        private readonly batchSize: number,
        private readonly concurrency: number,
        private readonly getCached: (from: number, to: number) => Promise<ISequencedDocumentMessage[]>,
        private readonly opsReceived: (ops: ISequencedDocumentMessage[]) => void,
    ) {
    }

    public fetchMessages(
        fromTotal: number,
        toTotal: number | undefined,
        abortSignal?: AbortSignal,
        cachedOnly?: boolean)
    {
        let opsFromSnapshot = 0;
        let opsFromCache = 0;
        let opsFromStorage = 0;

        const stream = requestOps(
            async (from: number, to: number) => {
                if (this.snapshotOps !== undefined && this.snapshotOps.length !== 0) {
                    const messages = this.snapshotOps.filter((op) =>
                        op.sequenceNumber >= from).map((op) => op.op);
                    if (messages.length > 0 && messages[0].sequenceNumber === from) {
                        this.snapshotOps = undefined;
                        opsFromSnapshot = messages.length;
                        return { messages, partialResult: true };
                    }
                    this.logger.sendErrorEvent({
                        eventName: "SnapshotOpsNotUsed",
                        length: this.snapshotOps.length,
                        first: this.snapshotOps[0].sequenceNumber,
                        from,
                        to,
                    });
                    this.snapshotOps = undefined;
                }

                // Cache in normal flow is continuous. Once there is a miss, stop consulting cache.
                // This saves a bit of processing time
                if (from < this.firstCacheMiss) {
                    const messagesFromCache = await this.getCached(from, to);
                    if (messagesFromCache.length !== 0) {
                        opsFromCache += messagesFromCache.length;
                        return {
                            messages: messagesFromCache,
                            partialResult: true,
                        };
                    }
                    this.firstCacheMiss = Math.min(this.firstCacheMiss, from);
                }

                if (cachedOnly) {
                    return { messages: [], partialResult: false };
                }

                const ops = await this.service.get(from, to);
                opsFromStorage += ops.messages.length;
                this.opsReceived(ops.messages);
                return ops;
            },
            // Staging: starting with no concurrency, listening for feedback first.
            // In future releases we will switch to actual concurrency
            this.concurrency,
            fromTotal, // inclusive
            toTotal, // exclusive
            this.batchSize,
            this.logger,
            abortSignal,
        );

        return streamObserver(stream, (result) => {
            if (result.done) {
                this.logger.sendPerformanceEvent({
                    eventName: "CacheOpsRetrieved",
                    opsFromSnapshot,
                    opsFromCache,
                    opsFromStorage,
                });
            }
        });
}
}
