/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IOdspSnapshot, ISnapshotOptions } from "./contracts";
import { EpochTracker } from "./epochTracker";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspResponse } from "./odspUtils";

/**
 * Fetches a snapshot from the server with a given version id.
 * @param snapshotUrl - snapshot url from where the odsp snapshot will be fetched
 * @param token - token used for authorization in the request
 * @param storageFetchWrapper - Implementation of the get/post methods used to fetch the snapshot
 * @param versionId - id of specific snapshot to be fetched
 * @param fetchFullSnapshot - whether we want to fetch full snapshot(with blobs)
 * @returns A promise of the snapshot and the status code of the response
 */
export async function fetchSnapshot(
    snapshotUrl: string,
    token: string | null,
    versionId: string,
    fetchFullSnapshot: boolean,
    logger: ITelemetryLogger,
    epochTracker: EpochTracker,
): Promise<IOdspResponse<IOdspSnapshot>> {
    const path = `/trees/${versionId}`;
    let queryParams: ISnapshotOptions = {};

    if (fetchFullSnapshot) {
        if (versionId !== "latest") {
            queryParams = { channels: 1, blobs: 2 };
        } else {
            queryParams = { deltas: 1, channels: 1, blobs: 2 };
        }
    }

    const queryString = getQueryString(queryParams);
    const { url, headers } = getUrlAndHeadersWithAuth(`${snapshotUrl}${path}${queryString}`, token);
    return PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "fetchSnapshot",
            headers: Object.keys(headers).length !== 0 ? true : undefined,
        },
        async () => epochTracker.fetchAndParseAsJSON<IOdspSnapshot>(url, { headers }, "snapshotTree"),
    );
}
