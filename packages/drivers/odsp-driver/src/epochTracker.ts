/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { assert, Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ThrottlingError, RateLimiter, NonRetryableError } from "@fluidframework/driver-utils";
import { IConnected } from "@fluidframework/protocol-definitions";
import {
    snapshotKey,
    ICacheEntry,
    IEntry,
    IFileEntry,
    IPersistedCache,
    IOdspError,
} from "@fluidframework/odsp-driver-definitions";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { PerformanceEvent, isFluidError, normalizeError } from "@fluidframework/telemetry-utils";
import { fetchAndParseAsJSONHelper, fetchArray, fetchHelper, getOdspResolvedUrl, IOdspResponse } from "./odspUtils";
import {
    IOdspCache,
    INonPersistentCache,
    IPersistedFileCache,
 } from "./odspCache";
import { IVersionedValueWithEpoch, persistedCacheValueVersion } from "./contracts";
import { ClpCompliantAppHeader } from "./contractsPublic";
import { pkgVersion as driverVersion } from "./packageVersion";

export type FetchType = "blob" | "createBlob" | "createFile" | "joinSession" | "ops" | "test" | "snapshotTree" |
    "treesLatest" | "uploadSummary" | "push" | "versions";

export type FetchTypeInternal = FetchType | "cache";

export const Odsp409Error = "Odsp409Error";

// Please update the README file in odsp-driver-definitions if you change the defaultCacheExpiryTimeoutMs.
export const defaultCacheExpiryTimeoutMs: number = 2 * 24 * 60 * 60 * 1000;

/**
 * This class is a wrapper around fetch calls. It adds epoch to the request made so that the
 * server can match it with its epoch value in order to match the version.
 * It also validates the epoch value received in response of fetch calls. If the epoch does not match,
 * then it also clears all the cached entries for the given container.
 */
export class EpochTracker implements IPersistedFileCache {
    private _fluidEpoch: string | undefined;

    public readonly rateLimiter: RateLimiter;
    private readonly driverId = uuid();
    // This tracks the request number made by the driver instance.
    private networkCallNumber = 1;
    constructor(
        protected readonly cache: IPersistedCache,
        protected readonly fileEntry: IFileEntry,
        protected readonly logger: ITelemetryLogger,
    ) {
        // Limits the max number of concurrent requests to 24.
        this.rateLimiter = new RateLimiter(24);
    }

    // public for UT purposes only!
    public setEpoch(epoch: string, fromCache: boolean, fetchType: FetchTypeInternal) {
        assert(this._fluidEpoch === undefined, 0x1db /* "epoch exists" */);
        this._fluidEpoch = epoch;

        this.logger.sendTelemetryEvent(
            {
                eventName: "EpochLearnedFirstTime",
                epoch,
                fetchType,
                fromCache,
            },
        );
    }

    public async get(
        entry: IEntry,
    ): Promise<any> {
        try {
            // Return undefined so that the ops/snapshots are grabbed from the server instead of the cache
            const value: IVersionedValueWithEpoch = await this.cache.get(this.fileEntryFromEntry(entry));
            // Version mismatch between what the runtime expects and what it recieved.
            // The cached value should not be used
            if (value === undefined || value.version !== persistedCacheValueVersion) {
                return undefined;
            }
            assert(value.fluidEpoch !== undefined, 0x1dc /* "all entries have to have epoch" */);
            if (this._fluidEpoch === undefined) {
                this.setEpoch(value.fluidEpoch, true, "cache");
            // Epoch mismatch, the cached value is considerably different from what the current state of
            // the runtime and should not be used
            } else if (this._fluidEpoch !== value.fluidEpoch) {
                return undefined;
            }
            // Expire the cached snapshot if it's older than the defaultCacheExpiryTimeoutMs and immediately
            // expire all old caches that do not have cacheEntryTime
            if (entry.type === snapshotKey) {
                const cacheTime = value.value?.cacheEntryTime;
                const currentTime = Date.now();
                if (cacheTime === undefined || currentTime - cacheTime >= defaultCacheExpiryTimeoutMs) {
                    this.logger.sendTelemetryEvent(
                        {
                            eventName: "odspVersionsCacheExpired",
                            duration: currentTime - cacheTime,
                            maxCacheAgeMs: defaultCacheExpiryTimeoutMs,
                        });
                    await this.removeEntries();
                    return undefined;
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return value.value;
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cacheFetchError", type: entry.type }, error);
            return undefined;
        }
    }

    public async put(entry: IEntry, value: any) {
        assert(this._fluidEpoch !== undefined, 0x1dd /* "no epoch" */);
        // For snapshots, the value should have the cacheEntryTime. This will be used to expire snapshots older
        // than the defaultCacheExpiryTimeoutMs.
        if (entry.type === snapshotKey) {
            value.cacheEntryTime = value.cacheEntryTime ?? Date.now();
        }
        const data: IVersionedValueWithEpoch = {
            value,
            version: persistedCacheValueVersion,
            fluidEpoch: this._fluidEpoch,
        };
        return this.cache.put(this.fileEntryFromEntry(entry), data)
            .catch((error) => {
                this.logger.sendErrorEvent({ eventName: "cachePutError", type: entry.type }, error);
                throw error;
            });
    }

    public async removeEntries(): Promise<void> {
        try {
            return await this.cache.removeEntries(this.fileEntry);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "removeCacheEntries" }, error);
        }
    }

    public get fluidEpoch() {
        return this._fluidEpoch;
    }

    public async validateEpochFromPush(details: IConnected) {
        const epoch = details.epoch;
        assert(epoch !== undefined, 0x09d /* "Connection details should contain epoch" */);
        try {
            this.validateEpochFromResponse(epoch, "push");
        } catch (error) {
            await this.checkForEpochError(error, epoch, "push");
            throw error;
        }
    }

    /**
     * Api to fetch the response for given request and parse it as json.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param fetchType - method for which fetch is called.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     * @param fetchReason - fetch reason to add to the request.
     */
    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchOptions: RequestInit,
        fetchType: FetchType,
        addInBody: boolean = false,
        fetchReason?: string,
    ): Promise<IOdspResponse<T>> {
        return this.fetchCore<T>(url, fetchOptions, fetchAndParseAsJSONHelper, fetchType, addInBody, fetchReason);
    }

    /**
     * Api to fetch the response for given request and parse it as json.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param fetchType - method for which fetch is called.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     * @param fetchReason - fetch reason to add to the request.
     */
    public async fetch(
        url: string,
        fetchOptions: RequestInit,
        fetchType: FetchType,
        addInBody: boolean = false,
        fetchReason?: string,
    ) {
        return this.fetchCore<Response>(url, fetchOptions, fetchHelper, fetchType, addInBody, fetchReason);
    }

    private async fetchCore<T>(
        url: string,
        fetchOptions: { [index: string]: any; },
        fetcher: (url: string, fetchOptions: { [index: string]: any; }) => Promise<IOdspResponse<T>>,
        fetchType: FetchType,
        addInBody: boolean = false,
        fetchReason?: string,
    ) {
        const clientCorrelationId = this.formatClientCorrelationId(fetchReason);
        // Add epoch in fetch request.
        this.addEpochInRequest(fetchOptions, addInBody, clientCorrelationId);
        let epochFromResponse: string | undefined;
        return this.rateLimiter.schedule(
            async () => fetcher(url, fetchOptions),
        ).then((response) => {
            epochFromResponse = response.headers.get("x-fluid-epoch");
            this.validateEpochFromResponse(epochFromResponse, fetchType);
            response.propsToLog.XRequestStatsHeader = clientCorrelationId;
            return response;
        }).catch(async (error) => {
            // Get the server epoch from error in case we don't have it as if undefined we won't be able
            // to mark it as epoch error.
            if (epochFromResponse === undefined) {
                epochFromResponse = (error as IOdspError).serverEpoch;
            }
            await this.checkForEpochError(error, epochFromResponse, fetchType);
            throw error;
        }).catch((error) => {
            const fluidError = normalizeError(error, { props: { XRequestStatsHeader: clientCorrelationId } });
            throw fluidError;
        });
    }

    /**
     * Api to fetch the response as it is for given request.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param fetchType - method for which fetch is called.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     * @param fetchReason - fetch reason to add to the request.
     */
    public async fetchArray(
        url: string,
        fetchOptions: { [index: string]: any; },
        fetchType: FetchType,
        addInBody: boolean = false,
        fetchReason?: string,
    ) {
        return this.fetchCore<ArrayBuffer>(url, fetchOptions, fetchArray, fetchType, addInBody, fetchReason);
    }

    private addEpochInRequest(
        fetchOptions: RequestInit,
        addInBody: boolean,
        clientCorrelationId: string,
    ) {
        const isClpCompliantApp = getOdspResolvedUrl(this.fileEntry.resolvedUrl).isClpCompliantApp;
        if (addInBody) {
            const headers: { [key: string]: string; } = {};
            headers["X-RequestStats"] = clientCorrelationId;
            if (this.fluidEpoch !== undefined) {
                headers["x-fluid-epoch"] = this.fluidEpoch;
            }
            if (isClpCompliantApp) {
                headers[ClpCompliantAppHeader.isClpCompliantApp] = isClpCompliantApp.toString();
            }
            this.addParamInBody(fetchOptions, headers);
        } else {
            const addHeader = (key: string, val: string) => {
                fetchOptions.headers = {
                    ...fetchOptions.headers,
                };
                assert(fetchOptions.headers !== undefined, 0x282 /* "Headers should be present now" */);
                fetchOptions.headers[key] = val;
            };
            addHeader("X-RequestStats", clientCorrelationId);
            if (this.fluidEpoch !== undefined) {
                addHeader("x-fluid-epoch", this.fluidEpoch);
            }
            if (isClpCompliantApp) {
                addHeader(ClpCompliantAppHeader.isClpCompliantApp, isClpCompliantApp.toString());
            }
        }
    }

    private addParamInBody(fetchOptions: RequestInit, headers: { [key: string]: string; }) {
        // We use multi part form request for post body where we want to use this.
        // So extract the form boundary to mark the end of form.
        const body = fetchOptions.body;
        assert(typeof body === "string", 0x21d /* "body is not string" */);
        const splitBody = body.split("\r\n");
        const firstLine = splitBody.shift();
        assert(firstLine !== undefined && firstLine.startsWith("--"), 0x21e /* "improper boundary format" */);
        const formParams = [firstLine];
        Object.entries(headers).forEach(([key, value]) => {
            formParams.push(`${key}: ${value}`);
        });
        splitBody.forEach((value: string) => {
            formParams.push(value);
        });
        fetchOptions.body = formParams.join("\r\n");
    }

    private formatClientCorrelationId(fetchReason?: string) {
        const items: string[] = [`driverId=${this.driverId}`, `RequestNumber=${this.networkCallNumber++}`];
        if (fetchReason !== undefined) {
            items.push(`fetchReason=${fetchReason}`);
        }
        return items.join(", ");
    }

    protected validateEpochFromResponse(
        epochFromResponse: string | undefined,
        fetchType: FetchTypeInternal,
        fromCache: boolean = false,
    ) {
        const error = this.checkForEpochErrorCore(epochFromResponse);
        if (error !== undefined) {
            throw error;
        }
        if (epochFromResponse !== undefined) {
            if (this._fluidEpoch === undefined) {
                this.setEpoch(epochFromResponse, fromCache, fetchType);
            }
        }
    }

    private async checkForEpochError(
        error: unknown,
        epochFromResponse: string | null | undefined,
        fetchType: FetchTypeInternal,
        fromCache: boolean = false,
    ) {
        if (isFluidError(error) && error.errorType === DriverErrorType.fileOverwrittenInStorage) {
            const epochError = this.checkForEpochErrorCore(epochFromResponse);
            if (epochError !== undefined) {
                epochError.addTelemetryProperties({
                    fromCache,
                    clientEpoch: this.fluidEpoch,
                    fetchType,
                });
                this.logger.sendErrorEvent({ eventName: "fileOverwrittenInStorage" }, epochError);
                // If the epoch mismatches, then clear all entries for such file entry from cache.
                await this.removeEntries();
                throw epochError;
            }
            // If it was categorized as epoch error but the epoch returned in response matches with the client epoch
            // then it was coherency 409, so rethrow it as throttling error so that it can retried. Default throttling
            // time is 1s.
            throw new ThrottlingError(
                `Coherency 409: ${error.message}`,
                1 /* retryAfterSeconds */,
                { [Odsp409Error]: true, driverVersion });
        }
    }

    private checkForEpochErrorCore(epochFromResponse: string | null | undefined) {
        // If epoch is undefined, then don't compare it because initially for createNew or TreesLatest
        // initializes this value. Sometimes response does not contain epoch as it is still in
        // implementation phase at server side. In that case also, don't compare it with our epoch value.
        if (this.fluidEpoch && epochFromResponse && (this.fluidEpoch !== epochFromResponse)) {
            // This is similar in nature to how fluidEpochMismatchError (409) is handled.
            // Difference - client detected mismatch, instead of server detecting it.
            return new NonRetryableError(
                "Epoch mismatch", DriverErrorType.fileOverwrittenInStorage, { driverVersion });
        }
    }

    private fileEntryFromEntry(entry: IEntry): ICacheEntry {
        return { ...entry, file: this.fileEntry };
    }
}

export class EpochTrackerWithRedemption extends EpochTracker {
    private readonly treesLatestDeferral = new Deferred<void>();

    protected validateEpochFromResponse(
        epochFromResponse: string | undefined,
        fetchType: FetchType,
        fromCache: boolean = false,
    ) {
        super.validateEpochFromResponse(epochFromResponse, fetchType, fromCache);

        // Any successful call means we have access to a file, i.e. any redemption that was required already happened.
        // That covers cases of "treesLatest" as well as "getVersions" or "createFile" - all the ways we can start
        // exploring a file.
        this.treesLatestDeferral.resolve();
    }

    public async get(
        entry: IEntry,
    ): Promise<any> {
        let result = super.get(entry);

        // equivalence of what happens in fetchAndParseAsJSON()
        if (entry.type === snapshotKey) {
            result = result
                .then((value) => {
                    // If there is nothing in cache, we need to wait for network call to complete (and do redemption)
                    // Otherwise file was redeemed in prior session, so if joinSession failed, we should not retry
                    if (value !== undefined) {
                        this.treesLatestDeferral.resolve();
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return value;
                })
                .catch((error) => {
                    this.treesLatestDeferral.reject(error);
                    throw error;
                });
        }
        return result;
    }

    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchOptions: { [index: string]: any; },
        fetchType: FetchType,
        addInBody: boolean = false,
        fetchReason?: string,
    ): Promise<IOdspResponse<T>> {
        // Optimize the flow if we know that treesLatestDeferral was already completed by the timer we started
        // joinSession call. If we did - there is no reason to repeat the call as it will fail with same error.
        const completed = this.treesLatestDeferral.isCompleted;

        try {
            return await super.fetchAndParseAsJSON<T>(url, fetchOptions, fetchType, addInBody, fetchReason);
        } catch (error: any) {
            // Only handling here treesLatest. If createFile failed, we should never try to do joinSession.
            // Similar, if getVersions failed, we should not do any further storage calls.
            // So treesLatest is the only call that can have parallel joinSession request.
            if (fetchType === "treesLatest") {
                this.treesLatestDeferral.reject(error);
            }
            if (fetchType !== "joinSession" || error.statusCode < 401 || error.statusCode > 404 || completed) {
                throw error;
            }
        }

        // It is joinSession failing with 401..404 error
        // Repeat after waiting for treeLatest succeeding (or fail if it failed).
        // No special handling after first call - if file has been deleted, then it's game over.

        // Ensure we have some safety here - we do not want to deadlock if we got logic somewhere wrong.
        // If we waited too long, we will log error event and proceed with call.
        // It may result in failure for user, but refreshing document would address it.
        // Thus we use rather long timeout (not to get these failures as much as possible), but not large enough
        // to unblock the process.
        await PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "JoinSessionSyncWait" },
            async (event) => {
                const timeoutRes = 51; // anything will work here
                let timer: ReturnType<typeof setTimeout>;
                const timeoutP = new Promise<number>((resolve) => {
                    timer = setTimeout(() => { resolve(timeoutRes); }, 15000);
                });
                const res = await Promise.race([
                    timeoutP,
                    // cancel timeout to unblock UTs (otherwise Node process does not exit for 15 sec)
                    this.treesLatestDeferral.promise.finally(() => clearTimeout(timer))]);
                if (res === timeoutRes) {
                    event.cancel();
                }
            },
            { start: true, end: true, cancel: "generic" });
        return super.fetchAndParseAsJSON<T>(url, fetchOptions, fetchType, addInBody);
    }
}

export interface ICacheAndTracker {
    cache: IOdspCache;
    epochTracker: EpochTracker;
}

export function createOdspCacheAndTracker(
    persistedCacheArg: IPersistedCache,
    nonpersistentCache: INonPersistentCache,
    fileEntry: IFileEntry,
    logger: ITelemetryLogger): ICacheAndTracker {
    const epochTracker = new EpochTrackerWithRedemption(persistedCacheArg, fileEntry, logger);
    return {
        cache: {
            ...nonpersistentCache,
            persistedCache: epochTracker,
        },
        epochTracker,
    };
}
