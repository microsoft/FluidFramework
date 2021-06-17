/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";

/**
 * Describes what kind of content is stored in cache entry.
 */
export const snapshotKey = "snapshot";
export type CacheContentType = "snapshot" | "ops";

/*
 * File / container identifier.
 * There is overlapping information here - host can use all of it or parts
 * to implement storage / identify files.
 */
export interface IFileEntry {
    /**
     * Unique and stable ID of the document.
     * Driver guarantees that docId is stable ID uniquely identifying document.
     */
    docId: string;
    /**
     * Resolved URI is provided for additional versatility - host can use it to
     * identify file in storage, and (as example) delete all cached entries for
     * a file if user requests so.
     * This is IOdspResolvedUrl in case of ODSP driver.
     */
    resolvedUrl: IFluidResolvedUrl;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 */
 export interface IEntry {
    /**
     * Identifies type of entry for a given file.
     * Each file can have multiple types of entries associated with it.
     * For example, it can be snapshot, blob, ops, etc.
     */
    type: CacheContentType;

    /**
     * Identifies individual entry for a given file and type.
     * Each file can have multiple cache entries associated with it.
     * This property identifies a particular instance of entry.
     * For example, for blobs it will be unique ID of the blob in a file.
     * For batch of ops, it can be starting op sequence number.
     * For types that have only one entry (like snapshots), it will be empty string.
     */
    key: string;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 */
export interface ICacheEntry extends IEntry {
    /**
     * Identifies file in storage this cached entry is for
     */
    file: IFileEntry;
}

/**
 * Persistent cache. This interface can be implemented by the host to provide durable caching
 * across sessions. If not provided at driver factory construction, factory will use in-memory
 * cache implementation that does not survive across sessions.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     * @param entry - cache entry, identifies file and particular key for this file.
     * @returns Cached value. undefined if nothing is cached.
    */
    get(entry: ICacheEntry): Promise<any>;

    /**
     * Put the value into cache.
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     * @param entry - cache entry.
     * @param value - JSON-serializable content.
     */
    put(entry: ICacheEntry, value: any): Promise<void>;

    /**
     * Removes the entries from the cache for given parametres.
     * @param file - file entry to be deleted.
     */
    removeEntries(file: IFileEntry): Promise<void>;
}
