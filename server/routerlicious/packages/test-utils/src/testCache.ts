/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICache } from "@fluidframework/server-services-core";

export class TestCache implements ICache {
	private readonly map = new Map<string, string>();
	public async get<T>(key: string): Promise<T> {
		return JSON.parse(this.map.get(key) ?? "") as T;
	}
	public async set<T>(key: string, value: T, expireAfterSeconds?: number): Promise<void> {
		this.map.set(key, JSON.stringify(value));
	}
	public async delete(key: string, appendPrefixToKey?: boolean): Promise<boolean> {
		const result = this.map.delete(key);
		return result;
	}
	public async incr(key: string): Promise<number> {
		let val = parseInt(this.map.get(key), 10) ?? 0;
		val += 1;
		this.map.set(key, val.toString());
		return val;
	}
	public async decr(key: string): Promise<number> {
		let val = parseInt(this.map.get(key), 10) ?? 0;
		val -= 1;
		this.map.set(key, val.toString());
		return val;
	}
}
