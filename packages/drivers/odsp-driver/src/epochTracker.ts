/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fluidEpochMismatchError, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { ThrottlingError } from "@fluidframework/driver-utils";
import { IConnected } from "@fluidframework/protocol-definitions";
import {
    snapshotKey,
    ICacheEntry,
    IEntry,
    IFileEntry,
    IPersistedCache,
} from "@fluidframework/odsp-driver-definitions";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { PerformanceEvent, LoggingError } from "@fluidframework/telemetry-utils";
import { fetchAndParseAsJSONHelper, fetchArray, IOdspResponse } from "./odspUtils";
import {
    IOdspCache,
    INonPersistentCache,
    IPersistedFileCache,
 } from "./odspCache";
import { RateLimiter } from "./rateLimiter";

export type FetchType = "blob" | "createBlob" | "createFile" | "joinSession" | "ops" | "test" | "snapshotTree" |
    "treesLatest" | "uploadSummary" | "push" | "versions";

export type FetchTypeInternal = FetchType | "cache";

// exported only of test purposes
export interface IVersionedValueWithEpoch {
    value: any;
    fluidEpoch: string,
    version: 2,
}

// exported only of test purposes
export const persistedCacheValueVersion = 2;

/**
 * This class is a wrapper around fetch calls. It adds epoch to the request made so that the
 * server can match it with its epoch value in order to match the version.
 * It also validates the epoch value received in response of fetch calls. If the epoch does not match,
 * then it also clears all the cached entries for the given container.
 */
export class EpochTracker implements IPersistedFileCache {
    private _fluidEpoch: string | undefined;

    public readonly rateLimiter: RateLimiter;

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
            const value: IVersionedValueWithEpoch = await this.cache.get(this.fileEntryFromEntry(entry));
            if (value === undefined || value.version !== persistedCacheValueVersion) {
                return undefined;
            }
            assert(value.fluidEpoch !== undefined, 0x1dc /* "all entries have to have epoch" */);
            if (this._fluidEpoch === undefined) {
                this.setEpoch(value.fluidEpoch, true, "cache");
            } else if (this._fluidEpoch !== value.fluidEpoch) {
                return undefined;
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
     */
    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchOptions: {[index: string]: any},
        fetchType: FetchType,
        addInBody: boolean = false,
    ): Promise<IOdspResponse<T>> {
        // Add epoch in fetch request.
        const request = this.addEpochInRequest(url, fetchOptions, addInBody);
        let epochFromResponse: string | undefined;
        try {
            const response = await this.rateLimiter.schedule(
                async () => fetchAndParseAsJSONHelper<T>(request.url, request.fetchOptions),
            );
            epochFromResponse = response.headers.get("x-fluid-epoch");
            this.validateEpochFromResponse(epochFromResponse, fetchType);
            return response;
        } catch (error) {
            // Get the server epoch from error in case we don't have it as if undefined we won't be able
            // to mark it as epoch error.
            if (epochFromResponse === undefined) {
                epochFromResponse = error.serverEpoch;
            }
            await this.checkForEpochError(error, epochFromResponse, fetchType);
            throw error;
        }
    }

    /**
     * Api to fetch the response as it is for given request.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param fetchType - method for which fetch is called.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     */
    public async fetchArray(
        url: string,
        fetchOptions: {[index: string]: any},
        fetchType: FetchType,
        addInBody: boolean = false,
    ) {
        // Add epoch in fetch request.
        const request = this.addEpochInRequest(url, fetchOptions, addInBody);
        let epochFromResponse: string | undefined;
        try {
            const response = await this.rateLimiter.schedule(
                async () => fetchArray(request.url, request.fetchOptions),
            );
            epochFromResponse = response.headers.get("x-fluid-epoch");
            this.validateEpochFromResponse(epochFromResponse, fetchType);
            return response;
        } catch (error) {
            // Get the server epoch from error in case we don't have it as if undefined we won't be able
            // to mark it as epoch error.
            if (epochFromResponse === undefined) {
                epochFromResponse = error.serverEpoch;
            }
            await this.checkForEpochError(error, epochFromResponse, fetchType);
            throw error;
        }
    }

    private addEpochInRequest(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean): {url: string, fetchOptions: {[index: string]: any}} {
        if (this.fluidEpoch !== undefined) {
            if (addInBody) {
                // We use multi part form request for post body where we want to use this.
                // So extract the form boundary to mark the end of form.
                let body: string = fetchOptions.body;
                const formBoundary = body.split("\r\n")[0].substring(2);
                body += `\r\nepoch=${this.fluidEpoch}\r\n`;
                body += `\r\n--${formBoundary}--`;
                fetchOptions.body = body;
            } else {
                const [mainUrl, queryString] = url.split("?");
                const searchParams = new URLSearchParams(queryString);
                searchParams.append("epoch", this.fluidEpoch);
                const urlWithEpoch = `${mainUrl}?${searchParams.toString()}`;
                if (urlWithEpoch.length > 2048) {
                    // Add in headers if the length becomes greater than 2048
                    // as ODSP has limitation for queries of length more that 2048.
                    fetchOptions.headers = {
                        ...fetchOptions.headers,
                        "x-fluid-epoch": this.fluidEpoch,
                    };
                } else {
                    return {
                        url: urlWithEpoch,
                        fetchOptions,
                    };
                }
            }
        }
        return { url, fetchOptions };
    }

    protected validateEpochFromResponse(
        epochFromResponse: string | undefined,
        fetchType: FetchTypeInternal,
        fromCache: boolean = false,
    ) {
        this.checkForEpochErrorCore(epochFromResponse);
        if (epochFromResponse !== undefined) {
            if (this._fluidEpoch === undefined) {
                this.setEpoch(epochFromResponse, fromCache, fetchType);
            }
        }
    }

    private async checkForEpochError(
        error: any,
        epochFromResponse: string | null | undefined,
        fetchType: FetchTypeInternal,
        fromCache: boolean = false,
    ) {
        if (error.errorType === DriverErrorType.fileOverwrittenInStorage) {
            try {
                // This will only throw if it is an epoch error.
                this.checkForEpochErrorCore(epochFromResponse, error.errorMessage);
            } catch (epochError) {
                assert(epochError instanceof LoggingError, 0x1d4 /* "type guard" */);
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
            this.logger.sendErrorEvent({ eventName: "Coherency409" }, error);
            throw new ThrottlingError(error.errorMessage ?? "Coherency409", 1000, 429);
        }
    }

    private checkForEpochErrorCore(epochFromResponse: string | null | undefined, message?: string) {
        // If epoch is undefined, then don't compare it because initially for createNew or TreesLatest
        // initializes this value. Sometimes response does not contain epoch as it is still in
        // implementation phase at server side. In that case also, don't compare it with our epoch value.
        if (this.fluidEpoch && epochFromResponse && (this.fluidEpoch !== epochFromResponse)) {
            throwOdspNetworkError(message ?? "Epoch Mismatch", fluidEpochMismatchError);
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
        fetchOptions: {[index: string]: any},
        fetchType: FetchType,
        addInBody: boolean = false,
    ): Promise<IOdspResponse<T>> {
        // Optimize the flow if we know that treesLatestDeferral was already completed by the timer we started
        // joinSession call. If we did - there is no reason to repeat the call as it will fail with same error.
        const completed = this.treesLatestDeferral.isCompleted;

        try {
            return await super.fetchAndParseAsJSON<T>(url, fetchOptions, fetchType, addInBody);
        } catch (error) {
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
                const timeoutP = new Promise<number>((accept) => {
                    timer = setTimeout(() => { accept(timeoutRes); }, 15000);
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
    logger: ITelemetryLogger): ICacheAndTracker
{
    const epochTracker = new EpochTracker(persistedCacheArg, fileEntry, logger);
    return {
        cache: {
            ...nonpersistentCache,
            persistedCache: epochTracker,
        },
        epochTracker,
    };
}
