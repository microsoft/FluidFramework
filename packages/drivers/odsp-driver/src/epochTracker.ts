/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fluidEpochMismatchError, OdspErrorType, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { fetchAndParseAsJSONHelper, fetchHelper, IOdspResponse } from "./odspUtils";
import { ICacheEntry, LocalPersistentCacheAdapter } from "./odspCache";
import { RateLimiter } from "./rateLimiter";

/**
 * This class is a wrapper around fetch calls. It adds epoch to the request made so that the
 * server can match it with its epoch value in order to match the version.
 * It also validates the epoch value received in response of fetch calls. If the epoch does not match,
 * then it also clears all the cached entries for the given container.
 */
export class EpochTracker {
    private _fluidEpoch: string | undefined;
    private _hashedDocumentId: string | undefined;
    public readonly rateLimiter: RateLimiter;
    constructor(
        private readonly persistedCache: LocalPersistentCacheAdapter,
        private readonly logger: ITelemetryLogger,
    ) {
        // Limits the max number of concurrent requests to 24.
        this.rateLimiter = new RateLimiter(24);
    }

    public set hashedDocumentId(docId: string | undefined) {
        assert(this._hashedDocumentId === undefined, "DocId should be set only once");
        assert(docId !== undefined, "Passed docId should not be undefined");
        this._hashedDocumentId = docId;
    }

    public get hashedDocumentId(): string | undefined {
        return this._hashedDocumentId;
    }

    public get fluidEpoch() {
        return this._fluidEpoch;
    }

    public async fetchFromCache<T>(entry: ICacheEntry, maxOpCount: number | undefined): Promise<T | undefined> {
        const value = await this.persistedCache.get(entry, maxOpCount);
        if (value !== undefined) {
            try {
                this.validateEpochFromResponse(value.fluidEpoch);
            } catch (error) {
                await this.checkForEpochError(error);
                throw error;
            }
            return value.value as T;
        }
    }

    /**
     * Api to fetch the response for given request and parse it as json.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     */
    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<IOdspResponse<T>> {
        // Add epoch in fetch request.
        const request = this.addEpochInRequest(url, fetchOptions, addInBody);
        try {
            const response = await this.rateLimiter.schedule(
                async () => fetchAndParseAsJSONHelper<T>(request.url, request.fetchOptions),
            );
            this.validateEpochFromResponse(response.headers.get("x-fluid-epoch"));
            return response;
        } catch (error) {
            await this.checkForEpochError(error);
            throw error;
        }
    }

    /**
     * Api to fetch the response as it is for given request.
     * @param url - url of the request
     * @param fetchOptions - fetch options for request containing body, headers etc.
     * @param addInBody - Pass True if caller wants to add epoch in post body.
     */
    public async fetchResponse(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<Response> {
        // Add epoch in fetch request.
        const request = this.addEpochInRequest(url, fetchOptions, addInBody);
        try {
            const response = await this.rateLimiter.schedule(
                async () => fetchHelper(request.url, request.fetchOptions),
            );
            this.validateEpochFromResponse(response.headers.get("x-fluid-epoch"));
            return response;
        } catch (error) {
            await this.checkForEpochError(error);
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

    private validateEpochFromResponse(epochFromResponse: string | undefined | null) {
        // If epoch is undefined, then don't compare it because initially for createNew or TreesLatest
        // initializes this value. Sometimes response does not contain epoch as it is still in
        // implementation phase at server side. In that case also, don't compare it with our epoch value.
        if (this.fluidEpoch && epochFromResponse && (this.fluidEpoch !== epochFromResponse)) {
            throwOdspNetworkError("Epoch Mismatch", fluidEpochMismatchError);
        }
        if (epochFromResponse) {
            this._fluidEpoch = epochFromResponse;
        }
    }

    private async checkForEpochError(error) {
        if (error.errorType === OdspErrorType.epochVersionMismatch) {
            this.logger.sendErrorEvent({ eventName: "EpochVersionMismatch" }, error);
            assert(!!this._hashedDocumentId, "DocId should be set to clear the cached entries!!");
            // If the epoch mismatches, then clear all entries for such document from cache.
            await this.persistedCache.removeAllEntriesForDocId(this._hashedDocumentId);
        }
    }
}
