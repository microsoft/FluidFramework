/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "./bufferBrowser";

/**
 * Hash a file. Consistent within a session, but should not be persisted and
 * is not consistent with git.
 * If called under an insecure context for a browser, this will fallback to
 * using the node implementation.
 *
 * @param file - The contents of the file in a buffer
 * @returns The hash of the content of the buffer
 */
export async function hashFile(file: IsoBuffer): Promise<string> {
    // Handle insecure contexts (e.g. running with local services)
    // by deferring to Node version, which uses a hash polyfill
    const subtle = crypto.subtle;
    if (subtle === undefined) {
        return import("./hashFileNode").then(async (m) => m.hashFile(file));
    }

    const hash = await crypto.subtle.digest("SHA-1", file);
    const hashArray = new Uint8Array(hash);
    const hashHex = Array.prototype.map.call(hashArray, function(byte) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return byte.toString(16).padStart(2, "0");
    }).join("");

    return hashHex;
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
