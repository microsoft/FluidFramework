/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as base64js from "base64-js";

import { IsoBuffer } from "./bufferBrowser";

async function digestBuffer(file: IsoBuffer, algorithm: "SHA-1" | "SHA-256"): Promise<Uint8Array> {
	const hash = await crypto.subtle.digest(algorithm, file);
	return new Uint8Array(hash);
}

function encodeDigest(hashArray: Uint8Array, encoding: "hex" | "base64"): string {
	// eslint-disable-next-line default-case
	switch (encoding) {
		case "hex": {
			const hashHex = Array.prototype.map
				.call(hashArray, (byte) => {
					return byte.toString(16).padStart(2, "0") as string;
				})
				.join("");
			return hashHex;
		}
		case "base64": {
			return base64js.fromByteArray(hashArray);
		}
	}
}

/**
 * Hash a file. Consistent within a session, but should not be persisted and
 * is not consistent with git.
 * If called under an insecure context for a browser, this will fallback to
 * using the node implementation.
 *
 * @param file - The contents of the file in a buffer.
 * @param algorithm - The hash algorithm to use, artificially constrained by what is used internally.
 * @param hashEncoding - The encoding of the returned hash, also artificially constrained.
 * @returns The hash of the content of the buffer.
 */
export async function hashFile(
	file: IsoBuffer,
	algorithm: "SHA-1" | "SHA-256" = "SHA-1",
	hashEncoding: "hex" | "base64" = "hex",
): Promise<string> {
	// Handle insecure contexts (e.g. running with local services)
	// by deferring to Node version, which uses a hash polyfill
	// When packed, this chunk will show as "FluidFramework-HashFallback" separately
	// from the main chunk and will be of non-trivial size.  It will not be served
	// under normal circumstances.
	if (crypto.subtle === undefined) {
		return import(
			/* webpackChunkName: "FluidFramework-HashFallback" */
			"./hashFileNode"
		).then(async (m) => m.hashFile(file, algorithm, hashEncoding));
	}

	// This is split up this way to facilitate testing (see the test for more info)
	const hashArray = await digestBuffer(file, algorithm);
	return encodeDigest(hashArray, hashEncoding);
}

/**
 * Create a github hash (Github hashes the string with blob and size)
 * Must be called under secure context for browsers
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export async function gitHashFile(file: IsoBuffer): Promise<string> {
	const size = file.byteLength;
	const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
	const hashBuffer = IsoBuffer.from(filePrefix + file.toString());

	// hashFile uses sha1; if that changes this will need to change too
	return hashFile(hashBuffer);
}
