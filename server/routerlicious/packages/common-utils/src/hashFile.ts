/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import sha1 from "sha.js/sha1";

import { IsoBuffer } from "./buffer";

/**
 * Create a github hash (Github hashes the string with blob and size)
 * Must be called under secure context for browsers
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 * @internal
 */
export async function gitHashFile(file: IsoBuffer): Promise<string> {
	const size = file.byteLength;
	const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
	const engine = new sha1();
	return engine.update(filePrefix).update(file).digest("hex") as string;
}
