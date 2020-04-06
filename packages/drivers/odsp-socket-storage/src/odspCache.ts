/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {delay, PromiseRegistry} from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";
import { IFileCreateResponse } from "./createFile";

type FileUrlRegistryItem = [IOdspResolvedUrl, IFileCreateResponse];

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
    registerSession(
        joinSessionKey: string,
        fetchJoinSession: () => Promise<ISocketStorageDiscovery>,
        expiryTime?: number,
    ): Promise<ISocketStorageDiscovery>

    /**
     * Removes registration for joinSessionKey
     */
    unregisterSession(joinSessionKey: string): boolean;
}

export interface IFileUrlRegistry {
    /**
     * Registers a file being created, ensuring resolveFileUrl is called exactly once
     */
    registerfile(
        fileKey: string,
        resolveFileUrl: () => Promise<FileUrlRegistryItem>,
    ): Promise<FileUrlRegistryItem>

    /**
     * Removes registration for fileKey
     */
    unregisterFile(fileKey: string): boolean;
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

export class CacheBase {
    protected readonly cache = new Map<string, any>();

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

    private async gc(key: string, expiryTime: number) {
        await delay(expiryTime);
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
    }

}

export class LocalCache extends CacheBase implements ICache {
    public async get(key: string) {
        return this.cache.get(key);
    }
}

export class SessionRegistry implements ISessionRegistry {
    private readonly registry: PromiseRegistry<ISocketStorageDiscovery> = new PromiseRegistry(
        {refreshExpiryOnReregister: true});

    async registerSession(
        joinSessionKey: string,
        asyncFn: () => Promise<ISocketStorageDiscovery>,
        expiryTime?: number | undefined,
    ) {
        return this.registry.register(joinSessionKey, asyncFn, expiryTime);
    }

    unregisterSession(joinSessionKey: string) {
        return this.registry.unregister(joinSessionKey);
    }
}

export class FileUrlRegistry implements IFileUrlRegistry {
    private readonly registry: PromiseRegistry<FileUrlRegistryItem> = new PromiseRegistry();

    async registerfile(
        fileKey: string,
        resolveFileUrl: () => Promise<FileUrlRegistryItem>,
    ): Promise<FileUrlRegistryItem> {
        return this.registry.register(fileKey, resolveFileUrl);
    }

    unregisterFile(fileKey: string): boolean {
        return this.registry.unregister(fileKey);
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
