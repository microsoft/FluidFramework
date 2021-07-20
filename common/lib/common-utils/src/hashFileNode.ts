/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import sha1 from "sha.js/sha1";
import { IsoBuffer } from "./bufferNode";

/**
 * Set a hashing function to be called in place of hashFile's internal
 * implementation when running under insecure contexts.  Not needed
 * when running under Node.  The internal algorithm should match that the
 * one used internally by hashFile.
 * @param hashFn - The function that should be used in place of hashFile
 */
export function setInsecureContextHashFn(hashFn: (f: IsoBuffer) => Promise<string>) {
    return;
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
    const engine = new sha1();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return engine.update(file).digest("hex");
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
    const engine = new sha1();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return engine.update(filePrefix)
        .update(file)
        .digest("hex");
}
