/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "../../services";

export class TestCache implements ICache {
	private readonly dictionary = new Map<string, any>();

	async get<T>(key: string): Promise<T> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return Promise.resolve(this.dictionary.get(key));
	}
	async set<T>(key: string, value: T): Promise<void> {
		this.dictionary.set(key, value);
		return Promise.resolve();
	}
	async delete(key: string): Promise<boolean> {
		return Promise.resolve(this.dictionary.delete(key));
	}
}
