/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

//* todo: comments
//* replace any with IOdspSnapshot
export interface ISnapshotCache {
    /**
     * Get the cache value of the key
     */
    get(key: string): Promise<any>;

    /**
     * Deletes value in storage
     */
    remove(key: string);

    /**
     * puts value into cache
     */
    addOrGet(key: string, value: () => Promise<any>): Promise<any>;

    /**
     * add a value directly to the cache
     */
    addValue(key: string, value: any);
}

export interface ISessionCache {
    /**
     * Ensures fetchJoinSession is called exactly once
     */
    getOrAddSessionInfo(
        joinSessionKey: string,
        fetchJoinSession: () => Promise<ISocketStorageDiscovery>,
    ): Promise<ISocketStorageDiscovery>

    /**
     * Removes info for joinSessionKey
     */
    removeSessionInfo(joinSessionKey: string): void;
}

export interface IFileUrlCache {
    /**
     * Ensures resolveFileUrl is called exactly once
     */
    getOrAddFileUrl(
        fileKey: string,
        resolveFileUrl: () => Promise<IOdspResolvedUrl>,
    ): Promise<IOdspResolvedUrl>

    /**
     * Removes the url for fileKey
     */
    removeFileUrl(fileKey: string): void;
}

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache {
    /**
     * permanent cache - only serializable content is allowed
     */
    readonly snapshotCache: ISnapshotCache;

    /**
     * cache of joined/joining sessions
     */
    readonly sessionCache: ISessionCache;

    /**
     * cache of resolved/resolving file URLs
     */
    readonly fileUrlCache: IFileUrlCache;
}

export class LocalCache implements ISnapshotCache {
    private readonly cache: PromiseCache<string, ISocketStorageDiscovery> = new PromiseCache({
        expiry: { policy: "sliding", durationMs: 60 * 60 * 1000 },
    });

    public async get(key: string) {
        //* todo: remove async keyword?
        return this.cache.get(key);
    }

    public remove(key: string) {
        this.cache.remove(key);
    }

    public async addOrGet(key: string, value: () => Promise<any>) {
        return this.cache.addOrGet(key, value);
    }

    public addValue(key: string, value: any) {
        return this.cache.addValue(key, value);
    }
}

export class SessionCache implements ISessionCache {
    private readonly cache: PromiseCache<string, ISocketStorageDiscovery> = new PromiseCache({
        expiry: { policy: "sliding", durationMs: 60 * 60 * 1000 },
    });

    public async getOrAddSessionInfo(
        joinSessionKey: string,
        fetchJoinSession: () => Promise<ISocketStorageDiscovery>,
    ): Promise<ISocketStorageDiscovery> {
        return this.cache.addOrGet(joinSessionKey, fetchJoinSession);
    }

    public removeSessionInfo(joinSessionKey: string): void {
        this.cache.remove(joinSessionKey);
    }
}

export class FileUrlCache implements IFileUrlCache {
    private readonly cache: PromiseCache<string, IOdspResolvedUrl> = new PromiseCache();

    public async getOrAddFileUrl(
        fileKey: string,
        resolveFileUrl: () => Promise<IOdspResolvedUrl>,
    ): Promise<IOdspResolvedUrl> {
        return this.cache.addOrGet(fileKey, resolveFileUrl);
    }

    public removeFileUrl(fileKey: string): void {
        this.cache.remove(fileKey);
    }
}

export class OdspCache implements IOdspCache {
    public readonly snapshotCache: ISnapshotCache = new LocalCache();
    public readonly sessionCache: ISessionCache = new SessionCache();
    public readonly fileUrlCache: IFileUrlCache = new FileUrlCache();

    constructor(
        cachedSnapshots?: Map<string, any>,
    ) {
        if (cachedSnapshots !== undefined) {
            for (const [key, value] of cachedSnapshots) {
                this.snapshotCache.addValue(key, value);
            }
        }
    }
}
