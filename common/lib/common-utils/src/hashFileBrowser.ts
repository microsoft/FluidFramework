/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "./assert";
import { IsoBuffer } from "./bufferBrowser";

let insecureContextHashFn: ((f: IsoBuffer) => Promise<string>) | undefined;

/**
 * Set a hashing function to be called in place of hashFile's internal
 * implementation when running under insecure contexts.  Not needed
 * when running under Node.  The internal algorithm should match that the
 * one used internally by hashFile.
 * @param hashFn - The function that should be used in place of hashFile
 */
export function setInsecureContextHashFn(hashFn: (f: IsoBuffer) => Promise<string>) {
    insecureContextHashFn = hashFn;
}

/**
 * Hash a file. Consistent within a session, but should not be persisted and
 * is not consistent with git.
 * If called under an insecure context for a browser, an override function
 * needs to be set using setInsecureContextHashFn
 *
 * @param file - The contents of the file in a buffer
 * @returns The hash of the content of the buffer
 */
export async function hashFile(file: IsoBuffer): Promise<string> {
    // Use the function override if provided
    if (insecureContextHashFn !== undefined) {
        assert(crypto.subtle === undefined, 0x002 /* "Both crypto.subtle and insecureContextHashFn are defined!" */);
        return insecureContextHashFn(file);
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
