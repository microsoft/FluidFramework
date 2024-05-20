/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISnapshot } from "@fluidframework/driver-definitions/internal";
import {
	getKeyForCacheEntry,
	type ICacheEntry,
	type IFileEntry,
	type IPersistedCache,
} from "@fluidframework/odsp-driver-definitions/internal";

export interface ValueWithSnapshot {
	value: ISnapshot;
}

export class TestSnapshotCache implements IPersistedCache {
	private readonly cache = new Map<string, ValueWithSnapshot>();
	private readonly versionCache = new Map<string, ValueWithSnapshot>();
	private readonly versionToCacheKey = new Map<string, string>();
	public async get(entry: ICacheEntry): Promise<ValueWithSnapshot | undefined> {
		const key = getKeyForCacheEntry(entry);
		return this.cache.get(key);
	}
	public async put(entry: ICacheEntry, value: ValueWithSnapshot): Promise<void> {
		const key = getKeyForCacheEntry(entry);
		this.cache.set(key, value);
		const versionKey = `${value.value.snapshotTree.id}`;
		this.versionCache.set(versionKey, value);
		this.versionToCacheKey.set(versionKey, key);
	}
	public async removeEntries(file: IFileEntry): Promise<void> {
		[...this.cache]
			.filter(([cacheKey]) => {
				const docIdFromKey = cacheKey.split("_");
				return docIdFromKey[0] === file.docId;
			})
			.map(([cacheKey]) => {
				this.cache.delete(cacheKey);
			});
	}

	public setVersionAsMain(version: string): void {
		const snapshot = this.versionCache.get(version);
		const key = this.versionToCacheKey.get(version);
		if (key !== undefined) {
			if (snapshot === undefined) {
				this.cache.delete(key);
			} else {
				this.cache.set(key, snapshot);
			}
		}
	}
	public clearCache(): void {
		this.cache.clear();
	}
	public reset() {
		this.cache.clear();
		this.versionCache.clear();
		this.versionToCacheKey.clear();
	}
}
