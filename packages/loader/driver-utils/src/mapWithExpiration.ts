/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

/**
 * An extension of Map that expires (deletes) entries after a period of inactivity.
 * The policy is based on the last time a key was written to.
 */
export class MapWithExpiration<TKey = any, TValue = any> extends Map<TKey, TValue> {
	/** Timestamps (as epoch ms numbers) of when each key was last refreshed */
	private readonly lastRefreshedTimes = new Map<TKey, number>();

	constructor(private readonly expiryMs: number) {
		super();
	}

	private refresh(key: TKey): void {
		this.lastRefreshedTimes.set(key, new Date().valueOf());
	}

	/**
	 * Returns true if the key is present and expired, false if it's not expired, and undefined if it's not found
	 * If cleanUp is passed as true, then delete any expired entry before returning.
	 */
	private checkExpiry(key: TKey, cleanUp: boolean = false): boolean | undefined {
		const refreshTime = this.lastRefreshedTimes.get(key);
		assert(
			(refreshTime !== undefined) === super.has(key),
			0x50c /* freshness map out of sync */,
		);

		if (refreshTime === undefined) {
			return undefined;
		}
		const expired = new Date().valueOf() - refreshTime >= this.expiryMs;
		if (expired && cleanUp) {
			this.delete(key);
		}
		return expired;
	}

	private clearExpiredEntries() {
		// forEach clears out any expired entries
		this.forEach(() => {});
	}

	get size(): number {
		this.clearExpiredEntries();
		return super.size;
	}

	has(key: TKey): boolean {
		this.checkExpiry(key, true /* cleanUp */);
		return super.has(key);
	}

	get(key: TKey): TValue | undefined {
		this.checkExpiry(key, true /* cleanUp */);
		return super.get(key);
	}

	set(key: TKey, value: TValue): this {
		// Sliding window expiration policy (on write)
		this.refresh(key);
		return super.set(key, value);
	}

	delete(key: TKey): boolean {
		this.lastRefreshedTimes.delete(key);
		return super.delete(key);
	}

	clear(): void {
		this.lastRefreshedTimes.clear();
		super.clear();
	}

	forEach(
		callbackfn: (value: TValue, key: TKey, map: Map<TKey, TValue>) => void,
		thisArg?: any,
	): void {
		const expiredKeys: TKey[] = [];
		super.forEach(
			(v, k, m) => {
				if (this.checkExpiry(k) === true) {
					expiredKeys.push(k);
				} else {
					callbackfn.bind(thisArg)(v, k, m);
				}
			},
			// Note we don't pass thisArg here, since we bind it directly to callbackFn and don't need it otherwise
		);

		// Clean up keys we know are expired now that we're done iterating
		expiredKeys.forEach((key: TKey) => {
			this.delete(key);
		});
	}

	entries(): IterableIterator<[TKey, TValue]> {
		this.clearExpiredEntries();
		return super.entries();
	}
	keys(): IterableIterator<TKey> {
		this.clearExpiredEntries();
		return super.keys();
	}
	values(): IterableIterator<TValue> {
		this.clearExpiredEntries();
		return super.values();
	}
	[Symbol.iterator](): IterableIterator<[TKey, TValue]> {
		this.clearExpiredEntries();
		return super[Symbol.iterator]();
	}

	valueOf() {
		this.clearExpiredEntries();
		return super.valueOf();
	}
}
