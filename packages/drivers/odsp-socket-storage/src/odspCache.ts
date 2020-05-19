/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl, IOdspSnapshot } from "./contracts";

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache {
    /**
     * permanent cache - only serializable content is allowed
     */
    readonly snapshotCache: PromiseCache<string, IOdspSnapshot>;

    /**
     * cache of joined/joining sessions
     */
    readonly sessionCache: PromiseCache<string, ISocketStorageDiscovery>;

    /**
     * cache of resolved/resolving file URLs
     */
    readonly fileUrlCache: PromiseCache<string, IOdspResolvedUrl>;
}

//* todo: Write good comments
//* todo: double-check expirations
export class OdspCache implements IOdspCache {
    /**
     * Permanent cache of
     * We are storing the getLatest response in cache for 10s so that other
     * containers initializing in the same timeframe can use this
     * result. We are choosing a small time period as the summarizes
     * are generated frequently and if that is the case then we don't
     * want to use the same getLatest result.
     */
    public readonly snapshotCache = new PromiseCache<string, IOdspSnapshot>({
        expiry: { policy: "absolute", durationMs: 10 * 1000 },
    });

    /**
     * Cache of join session call results.
     * If the result is valid and used within an hour we put the same result again with updated time
     * to keep using it for consecutive join session calls.
     */
    public readonly sessionCache = new PromiseCache<string, ISocketStorageDiscovery>({
        expiry: { policy: "sliding", durationMs: 60 * 60 * 1000 },
    });

    /**
     *
     */
    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();

    constructor(
        cachedSnapshots?: Map<string, IOdspSnapshot>,
    ) {
        if (cachedSnapshots !== undefined) {
            for (const [key, value] of cachedSnapshots) {
                this.snapshotCache.addValue(key, value);
            }
        }
    }
}
