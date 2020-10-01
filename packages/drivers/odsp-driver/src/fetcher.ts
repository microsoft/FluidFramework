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
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<IOdspResponse<T>> {
        this.addEpochInRequest(fetchOptions, addInBody);
        let response: IOdspResponse<T>;
        try {
            response = await fetchAndParseAsJSONHelper<T>(url, fetchOptions);
            this.extractEpochFromResponse(response.headers);
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
        return response;
    }

    public async fetchAndParseAsBuffer<T>(
        url: string,
        fetchOptions: {[index: string]: any},
        addInBody: boolean = false,
    ): Promise<IOdspResponse<IsoBuffer>> {
        this.addEpochInRequest(fetchOptions, addInBody);
        let response: IOdspResponse<IsoBuffer>;
        try {
            response = await fetchAndParseAsBufferHelper(url, fetchOptions);
            this.extractEpochFromResponse(response.headers);
        } catch (error) {
            this.checkForEpochError(error);
            throw error;
        }
        return response;
    }

    private addEpochInRequest(fetchOptions: {[index: string]: any}, addInBody: boolean) {
        if (this.fluidEpoch !== undefined) {
            if (addInBody) {
                let body: string = fetchOptions.body;
                const formBoundary = body.split("\r\n")[0].substring(2);
                body += `\r\nepoch=${this.fluidEpoch}\r\n`;
                body += `\r\n--${formBoundary}--`;
                fetchOptions.body = body;
                return;
            }
            fetchOptions.headers = {
                ...fetchOptions.headers,
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
