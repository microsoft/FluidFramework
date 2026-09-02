/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { gitHashFile, hashFile, IsoBuffer } from "../../indexBrowser.js";

/** Production browser hashing operations exposed to the Playwright page. */
export interface BrowserHashApi {
	gitHashFile(fileBase64: string): Promise<string>;
	hashFile(
		fileBase64: string,
		algorithm: "SHA-1" | "SHA-256",
		encoding: "hex" | "base64",
	): Promise<string>;
}

const browserHashApi: BrowserHashApi = {
	async gitHashFile(fileBase64) {
		return gitHashFile(IsoBuffer.from(fileBase64, "base64"));
	},
	async hashFile(fileBase64, algorithm, encoding) {
		return hashFile(IsoBuffer.from(fileBase64, "base64"), algorithm, encoding);
	},
};

Object.assign(globalThis, { browserHashApi });
