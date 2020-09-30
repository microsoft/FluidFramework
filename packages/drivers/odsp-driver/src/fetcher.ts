/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { OdspErrorType } from "./odspError";
import { fetchAndParseAsBufferHelper, fetchAndParseAsJSONHelper, IOdspResponse } from "./odspUtils";

export class Fetcher {
    constructor(
        private fluidEpoch: string | undefined,
        private readonly logger?: ITelemetryLogger) {
    }

    public async fetchAndParseAsJSON<T>(
        url: string,
        fetchHeaders: {[index: string]: any},
    ): Promise<IOdspResponse<T>> {
        this.addEpochHeader(fetchHeaders);
        let response: IOdspResponse<T>;
        try {
            response = await fetchAndParseAsJSONHelper<T>(url, fetchHeaders);
            this.extractEpochFromResponse(response.headers);
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
        return response;
    }

    public async fetchAndParseAsBuffer<T>(
        url: string,
        fetchHeaders: {[index: string]: any},
    ): Promise<IOdspResponse<IsoBuffer>> {
        this.addEpochHeader(fetchHeaders);
        let response: IOdspResponse<IsoBuffer>;
        try {
            response = await fetchAndParseAsBufferHelper(url, fetchHeaders);
            this.extractEpochFromResponse(response.headers);
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
        return response;
    }

    private addEpochHeader(fetchHeaders: {[index: string]: any}) {
        if (this.fluidEpoch !== undefined) {
            fetchHeaders.headers = {
                ...fetchHeaders.headers,
                "x-fluid-epoch": this.fluidEpoch,
            };
        }
    }

    private extractEpochFromResponse(headers: Map<string, string>) {
        const epochFromResponse = headers.get("x-fluid-epoch");
        assert(this.fluidEpoch === undefined || this.fluidEpoch === null
            || epochFromResponse === undefined || epochFromResponse === null
            || (this.fluidEpoch === epochFromResponse), "Fluid Epoch should match");
        if (epochFromResponse !== undefined && epochFromResponse !== null) {
            this.fluidEpoch = epochFromResponse;
        }
    }

    private checkForEpochError(error) {
        if (error.errorType === OdspErrorType.epochVersionMismatch && this.logger !== undefined) {
            this.logger.sendErrorEvent({ eventName: "EpochVersionMistmatch" }, error);
        }
    }
}
