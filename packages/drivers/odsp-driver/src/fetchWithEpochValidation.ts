/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { createOdspNetworkError, fluidEpochMismatchError, OdspErrorType } from "@fluidframework/odsp-doclib-utils";
import { fetchAndParseAsJSONHelper, fetchHelper, IOdspResponse } from "./odspUtils";
import { ICacheEntry, IPersistedCache, IPersistedCacheValue } from "./odspCache";

/**
 * This class is a wrapper around fetch calls. It adds epoch to the request made so that the
 * server can match it with its epoch value in order to match the version.
 * It also validates the epoch value received in response of fetch calls. If the epoch does not match,
 * then it also clears all the cached entries for the given container.
 */
export class FetchWithEpochValidation {
    private _fluidEpoch: string | undefined;
    private _hashedDocumentId: string | undefined;
    constructor(
        private readonly persistedCache: IPersistedCache,
        private readonly logger?: ITelemetryLogger) {
    }

    public set hashedDocumentId(docId: string | undefined) {
        this._hashedDocumentId = docId;
    }

    public get hashedDocumentId(): string | undefined {
        return this._hashedDocumentId;
    }

    public get fluidEpoch() {
        return this._fluidEpoch;
    }

    public async fetchFromCache<T>(entry: ICacheEntry, maxOpCount: number | undefined): Promise<T | undefined> {
        const value: IPersistedCacheValue = await this.persistedCache.get(entry, maxOpCount);
        if (value !== undefined) {
            try {
                this.validateEpochFromResponse(value.fluidEpoch);
            } catch (error) {
                this.checkForEpochError(createOdspNetworkError("Epoch Mismatch", fluidEpochMismatchError));
            }
            return value.value as T;
        }
        return undefined;
    }

    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<IOdspResponse<T>> {
        // Add epoch either in header or in body.
        this.addEpochInRequest(fetchOptions, addInBody);
        try {
            const response = await fetchAndParseAsJSONHelper<T>(url, fetchOptions);
            this.validateEpochFromResponse(response.headers.get("x-fluid-epoch"));
            return response;
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
    }

    public async fetchResponse(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<Response> {
        // Add epoch either in header or in body.
        this.addEpochInRequest(fetchOptions, addInBody);
        try {
            const response = await fetchHelper(url, fetchOptions);
            this.validateEpochFromResponse(response.headers.get("x-fluid-epoch"));
            return response;
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
    }

    private addEpochInRequest(fetchOptions: {[index: string]: any}, addInBody: boolean) {
        if (this.fluidEpoch !== undefined) {
            if (addInBody) {
                // We use multi part form request for post body where we want to use this.
                // So extract the form boundary to mark the end of form.
                let body: string = fetchOptions.body;
                const formBoundary = body.split("\r\n")[0].substring(2);
                body += `\r\nepoch=${this.fluidEpoch}\r\n`;
                body += `\r\n--${formBoundary}--`;
                fetchOptions.body = body;
                return;
            }
            // Else add in headers.
            fetchOptions.headers = {
                ...fetchOptions.headers,
                "x-fluid-epoch": this.fluidEpoch,
            };
        }
    }

    private validateEpochFromResponse(epochFromResponse: string | undefined | null) {
        // If epoch is undefined, then don't compare it because initially for createNew or TreesLatest
        // initializes this value. Sometimes response does not contain epoch as it is still in
        // implementation phase at server side. In that case also, don't compare it with our epoch value.
        assert(this.fluidEpoch === undefined
            || epochFromResponse === undefined || epochFromResponse === null
            || (this.fluidEpoch === epochFromResponse), "Fluid Epoch should match");
        if (epochFromResponse !== undefined && epochFromResponse !== null) {
            this._fluidEpoch = epochFromResponse;
        }
    }

    private checkForEpochError(error) {
        if (error.errorType === OdspErrorType.epochVersionMismatch && this.logger !== undefined) {
            this.logger.sendErrorEvent({ eventName: "EpochVersionMismatch" }, error);
            // If the epoch mismatches, then clear all entries for such document from cache.
            assert(this._hashedDocumentId, "DocId should be set to clear the cached entries!!");
            this.persistedCache.removeAllEntriesForDocId(this._hashedDocumentId);
        }
    }
}
