/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * These utils are used for prefetching the snapshot in prefetchLatestSnapshot.ts.
 * Don't add any other utility functions which are not used in prefetching.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    isTokenFromCache,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    TokenFetchOptions,
    tokenFromResponse,
} from "@fluidframework/odsp-driver-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IOdspSnapshot } from "./contracts";

export function evalBlobsAndTrees(snapshot: IOdspSnapshot) {
    let numTrees = 0;
    let numBlobs = 0;
    let encodedBlobsSize = 0;
    let decodedBlobsSize = 0;
    for (const tree of snapshot.trees) {
        for (const treeEntry of tree.entries) {
            if (treeEntry.type === "blob") {
                numBlobs++;
            } else if (treeEntry.type === "tree") {
                numTrees++;
            }
        }
    }
    if (snapshot.blobs !== undefined) {
        for (const blob of snapshot.blobs) {
            decodedBlobsSize += blob.size;
            encodedBlobsSize += blob.content.length;
        }
    }
    return { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize };
}

export function toInstrumentedOdspTokenFetcher(
    logger: ITelemetryLogger,
    resolvedUrl: IOdspResolvedUrl,
    tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
    throwOnNullToken: boolean,
): (options: TokenFetchOptions, name: string) => Promise<string | null> {
    return async (options: TokenFetchOptions, name: string) => {
        // Telemetry note: if options.refresh is true, there is a potential perf issue:
        // Host should optimize and provide non-expired tokens on all critical paths.
        // Exceptions: race conditions around expiration, revoked tokens, host that does not care
        // (fluid-fetcher)
        return PerformanceEvent.timedExecAsync(
            logger,
            {
                eventName: `${name}_GetToken`,
                attempts: options.refresh ? 2 : 1,
                hasClaims: !!options.claims,
                hasTenantId: !!options.tenantId,
            },
            async (event) => tokenFetcher({
                ...options,
                siteUrl: resolvedUrl.siteUrl,
                driveId: resolvedUrl.driveId,
                itemId: resolvedUrl.itemId,
            }).then((tokenResponse) => {
                const token = tokenFromResponse(tokenResponse);
                // This event alone generates so many events that is materially impacts cost of telemetry
                // Thus do not report end event when it comes back quickly.
                // Note that most of the hosts do not report if result is comming from cache or not,
                // so we can't rely on that here
                if (event.duration >= 32) {
                    event.end({ fromCache: isTokenFromCache(tokenResponse), isNull: token === null });
                }
                if (token === null && throwOnNullToken) {
                    throwOdspNetworkError(`${name} Token is null`, fetchTokenErrorCode);
                }
                return token;
            }),
            { cancel: "generic" });
    };
}
