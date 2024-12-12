/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICache } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class TestCache implements ICache {
	private readonly map = new Map<string, string>();
	public async get(key: string): Promise<string> {
		return this.map.get(key) ?? "";
	}
	public async set(key: string, value: string): Promise<void> {
		this.map.set(key, value);
	}
	public async delete(key: string): Promise<boolean> {
		const result = this.map.delete(key);
		return result;
	}
	public async incr(key: string): Promise<number> {
		const strVal = this.map.get(key);
		let val = strVal ? parseInt(strVal, 10) : 0;
		val += 1;
		this.map.set(key, val.toString());
		return val;
	}
	public async decr(key: string): Promise<number> {
		const strVal = this.map.get(key);
		let val = strVal ? parseInt(strVal, 10) : 0;
		val -= 1;
		this.map.set(key, val.toString());
		return val;
	}
}
