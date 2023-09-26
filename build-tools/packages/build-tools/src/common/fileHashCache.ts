/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sha256 } from "./hash";
import { readFileAsync } from "./utils";

export class FileHashCache {
	private fileHashCache = new Map<string, Promise<string>>();

	public async getFileHash(path: string, hash: (buffer: Buffer) => string = sha256) {
		const cachedHashP = this.fileHashCache.get(path);
		if (cachedHashP) {
			return cachedHashP;
		}

		const newHashP = readFileAsync(path).then(hash);
		this.fileHashCache.set(path, newHashP);
		return newHashP;
	}

	public clear() {
		this.fileHashCache.clear();
	}
}
