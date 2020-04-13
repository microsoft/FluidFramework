/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay, PromiseRegistry } from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";
import { IFileCreateResponse } from "./createFile";

export interface ICache {
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
    put(key: string, value: any, expiryTime?: number);
}

export interface ISessionRegistry {
    /**
     * Registers a session, ensuring fetchJoinSession is called exactly once
     */
    getSession(
        joinSessionKey: string,
        fetchJoinSession: () => Promise<ISocketStorageDiscovery>,
        expiryTime?: number,
    ): Promise<ISocketStorageDiscovery>

    /**
     * Removes registration for joinSessionKey
     */
    deleteSessionInfo(joinSessionKey: string): void;
}

export interface IFileUrlRegistry {
    /**
     * Registers a file being created, ensuring resolveFileUrl is called exactly once
     */
    getFileUrl(
        fileKey: string,
        resolveFileUrl: () => Promise<IOdspResolvedUrl>,
    ): Promise<IOdspResolvedUrl>

    /**
     * Removes registration for fileKey
     */
    deleteFileUrl(fileKey: string): void;
}

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache {
    /**
     * permanent cache - only serializable content is allowed
     */
    readonly localStorage: ICache;

    /**
     * cache of joined/joining sessions
     */
    readonly sessionRegistry: ISessionRegistry;

    /**
     * cache of resolved/resolving file URLs
     */
    readonly fileUrlRegistry: IFileUrlRegistry;
}

export class LocalCache implements ICache {
    private readonly cache = new Map<string, any>();

    public async get(key: string) {
        return this.cache.get(key);
    }

    public remove(key: string) {
        this.cache.delete(key);
    }

    public put(key: string, value: any, expiryTime?: number) {
        this.cache.set(key, value);
        if (expiryTime) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.gc(key, expiryTime);
        }
    }
}

export class SessionRegistry implements ISessionRegistry {
    // We want to keep using the same join session for consecutive join session calls
    // within the given expiry, so set extendExpiryOnReregister: true
    private readonly registry: PromiseRegistry<string, ISocketStorageDiscovery> = new PromiseRegistry(
        {extendExpiryOnReregister: true});

    async getSession(
        joinSessionKey: string,
        asyncFn: () => Promise<ISocketStorageDiscovery>,
        expiryTime?: number | undefined,
    ) {
        return this.registry.register(joinSessionKey, asyncFn, expiryTime);
    }

    deleteSessionInfo(joinSessionKey: string) {
        this.registry.unregister(joinSessionKey);
    }
}

export class FileUrlRegistry implements IFileUrlRegistry {
    private readonly registry: PromiseRegistry<IOdspResolvedUrl> = new PromiseRegistry();

    async getFileUrl(
        fileKey: string,
        resolveFileUrl: () => Promise<IOdspResolvedUrl>,
    ): Promise<IOdspResolvedUrl> {
        return this.registry.register(fileKey, resolveFileUrl);
    }

    deleteFileUrl(fileKey: string): boolean {
        this.registry.unregister(fileKey);
    }
}

export class OdspCache implements IOdspCache {
    public readonly localStorage: ICache;
    public readonly sessionRegistry: ISessionRegistry = new SessionRegistry();
    public readonly fileUrlRegistry: IFileUrlRegistry = new FileUrlRegistry();

    constructor(permanentCache?: ICache) {
        this.localStorage = permanentCache !== undefined ? permanentCache : new LocalCache();
    }
}
