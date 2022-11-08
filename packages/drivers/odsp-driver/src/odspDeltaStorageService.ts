/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { v4 as uuid } from "uuid";
import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { InstrumentedStorageTokenFetcher } from "@fluidframework/odsp-driver-definitions";
import { IDeltasFetchResult, IDocumentDeltaStorageService } from "@fluidframework/driver-definitions";
import {
    requestOps,
    streamObserver,
} from "@fluidframework/driver-utils";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { EpochTracker } from "./epochTracker";
import { getWithRetryForTokenRefresh } from "./odspUtils";

/**
 * Provides access to the underlying delta storage on the server for sharepoint driver.
 */
export class OdspDeltaStorageService {
    constructor(
        private readonly deltaFeedUrl: string,
        private readonly getStorageToken: InstrumentedStorageTokenFetcher,
        private readonly epochTracker: EpochTracker,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    /**
     * Retrieves ops from storage
     * @param from - inclusive
     * @param to - exclusive
     * @param telemetryProps - properties to add when issuing telemetry events
     * @param scenarioName - reason for fetching ops
     * @returns ops retrieved & info if result was partial (i.e. more is available)
     */
     public async get(
        from: number,
        to: number,
        telemetryProps: ITelemetryProperties,
        scenarioName?: string,
    ): Promise<IDeltasFetchResult> {
        return getWithRetryForTokenRefresh(async (options) => {
            // Note - this call ends up in getSocketStorageDiscovery() and can refresh token
            // Thus it needs to be done before we call getStorageToken() to reduce extra calls
            const baseUrl = this.buildUrl(from, to);
            const storageToken = await this.getStorageToken(options, "DeltaStorage");

            const formBoundary = uuid();
            let postBody = `--${formBoundary}\r\n`;
            postBody += `Authorization: Bearer ${storageToken}\r\n`;
            postBody += `X-HTTP-Method-Override: GET\r\n`;

            postBody += `_post: 1\r\n`;
            postBody += `\r\n--${formBoundary}--`;
            const headers: { [index: string]: any; } = {
                "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
            };

            // Some request take a long time (1-2 minutes) to complete, where telemetry shows very small amount
            // of time spent on server, and usually small payload sizes. I.e. all the time is spent somewhere in
            // networking. Even bigger problem - a lot of requests timeout (based on cursory look - after 1-2 minutes)
            // So adding some timeout to ensure we retry again in hope of faster success.
            // Please see https://github.com/microsoft/FluidFramework/issues/6997 for details.
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), 30000);

            const response = await this.epochTracker.fetchAndParseAsJSON<IDeltaStorageGetResponse>(
                baseUrl,
                {
                    headers,
                    body: postBody,
                    method: "POST",
                    signal: abort.signal,
                },
                "ops",
                true,
                scenarioName,
            );
            clearTimeout(timer);
            const deltaStorageResponse = response.content;
            const messages = deltaStorageResponse.value.length > 0 && "op" in deltaStorageResponse.value[0]
                ? (deltaStorageResponse.value as ISequencedDeltaOpMessage[]).map((operation) => operation.op)
                : deltaStorageResponse.value as ISequencedDocumentMessage[];

            this.logger.sendPerformanceEvent({
                eventName: "OpsFetch",
                headers: Object.keys(headers).length !== 0 ? true : undefined,
                length: messages.length,
                duration: response.duration, // this duration for single attempt!
                ...response.propsToLog,
                attempts: options.refresh ? 2 : 1,
                from,
                to,
                ...telemetryProps,
                reason: scenarioName,
            });

            // It is assumed that server always returns all the ops that it has in the range that was requested.
            // This may change in the future, if so, we need to adjust and receive "end" value from server in such case.
            return { messages, partialResult: false };
        });
    }

    public buildUrl(from: number, to: number) {
        const filter = encodeURIComponent(`sequenceNumber ge ${from} and sequenceNumber le ${to - 1}`);
        const queryString = `?ump=1&filter=${filter}`;
        return `${this.deltaFeedUrl}${queryString}`;
    }
}

export class OdspDeltaStorageWithCache implements IDocumentDeltaStorageService {
    private firstCacheMiss = Number.MAX_SAFE_INTEGER;

    public constructor(
        private snapshotOps: ISequencedDocumentMessage[] | undefined,
        private readonly logger: ITelemetryLogger,
        private readonly batchSize: number,
        private readonly concurrency: number,
        private readonly getFromStorage: (
            from: number,
            to: number,
            telemetryProps: ITelemetryProperties,
            fetchReason?: string) => Promise<IDeltasFetchResult>,
        private readonly getCached: (from: number, to: number) => Promise<ISequencedDocumentMessage[]>,
        private readonly requestFromSocket: (from: number, to: number) => void,
        private readonly opsReceived: (ops: ISequencedDocumentMessage[]) => void,
    ) {
    }

    protected validateMessages(reason: string, messages: ISequencedDocumentMessage[], from: number) {
        if (messages.length !== 0) {
            const start = messages[0].sequenceNumber;
            const length = messages.length;
            const last = messages[length - 1].sequenceNumber;
            if (start !== from) {
                this.logger.sendErrorEvent({ eventName: "OpsFetchViolation", reason, from, start, last, length });
                messages.length = 0;
            }
            if (last + 1 !== from + length) {
                this.logger.sendErrorEvent({ eventName: "OpsFetchViolation", reason, from, start, last, length });
                // we can do better here by finding consecutive sub-block and return it
                messages.length = 0;
            }
        }
    }

    public fetchMessages(
        fromTotal: number,
        toTotal: number | undefined,
        abortSignal?: AbortSignal,
        cachedOnly?: boolean,
        fetchReason?: string) {
        // We do not control what's in the cache. Current API assumes that fetchMessages() keeps banging on
        // storage / cache until it gets ops it needs. This would result in deadlock if fixed range is asked from
        // cache and it's not there.
        // Better implementation would be to return only what we have in cache, but that also breaks API
        assert(!cachedOnly || toTotal === undefined, 0x1e3);

        let opsFromSnapshot = 0;
        let opsFromCache = 0;
        let opsFromStorage = 0;

        const requestCallback = async (from: number, to: number, telemetryProps: ITelemetryProperties) => {
            if (this.snapshotOps !== undefined && this.snapshotOps.length !== 0) {
                const messages = this.snapshotOps.filter((op) =>
                    op.sequenceNumber >= from && op.sequenceNumber < to);
                this.validateMessages("cached", messages, from);
                if (messages.length > 0 && messages[0].sequenceNumber === from) {
                    this.snapshotOps = this.snapshotOps.filter((op) => op.sequenceNumber >= to);
                    opsFromSnapshot = messages.length;
                    return { messages, partialResult: true };
                }
                this.snapshotOps = undefined;
            }

            // Kick out request to PUSH for ops if it has them
            this.requestFromSocket(from, to);

            // Cache in normal flow is continuous. Once there is a miss, stop consulting cache.
            // This saves a bit of processing time
            if (from < this.firstCacheMiss) {
                const messagesFromCache = await this.getCached(from, to);
                this.validateMessages("cached", messagesFromCache, from);
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

            const ops = await this.getFromStorage(from, to, telemetryProps, fetchReason);
            this.validateMessages("storage", ops.messages, from);
            opsFromStorage += ops.messages.length;
            this.opsReceived(ops.messages);
            return ops;
        };

        const stream = requestOps(
            async (from: number, to: number, telemetryProps: ITelemetryProperties) => {
                const result = await requestCallback(from, to, telemetryProps);
                // Catch all case, just in case
                this.validateMessages("catch all", result.messages, from);
                return result;
            },
            // Staging: starting with no concurrency, listening for feedback first.
            // In future releases we will switch to actual concurrency
            this.concurrency,
            fromTotal, // inclusive
            toTotal, // exclusive
            this.batchSize,
            this.logger,
            abortSignal,
            fetchReason,
        );

        return streamObserver(stream, (result) => {
            if (result.done && opsFromSnapshot + opsFromCache + opsFromStorage !== 0) {
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
