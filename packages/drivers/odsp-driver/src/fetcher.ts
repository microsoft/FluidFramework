/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { OdspErrorType } from "./odspError";
import { fetchHelper, IOdspResponse } from "./odspUtils";

export class Fetcher {
    constructor(
        private fluidEpoch: string | undefined,
        private readonly logger?: ITelemetryLogger) {
    }

    public async fetch<T>(
        url: string,
        fetchHeaders: {[index: string]: any},
    ): Promise<IOdspResponse<T>> {
        if (this.fluidEpoch !== undefined) {
            fetchHeaders.headers = {
                ...fetchHeaders.headers,
                "x-fluid-epoch": this.fluidEpoch,
            };
        }
        let response: IOdspResponse<T>;
        try {
            response = await fetchHelper<T>(url, fetchHeaders);
            const epochFromResponse = response.headers.get("x-fluid-epoch");
            assert(!this.fluidEpoch || !epochFromResponse
                || (this.fluidEpoch === epochFromResponse), "Fluid Epoch should match");
            if (epochFromResponse) {
                this.fluidEpoch = epochFromResponse;
            }
        } catch (error) {
            if (this.logger !== undefined && error.errorType === OdspErrorType.epochVersionMismatch) {
                this.logger.sendErrorEvent({ eventName: "EpochVersionMistmatch" }, error);
            }
            throw error;
        }
        return response;
    }
}
