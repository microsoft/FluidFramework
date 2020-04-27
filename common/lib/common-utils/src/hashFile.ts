/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import * as sha1 from "sha.js/sha1";

/**
 * Create Hash (Github hashes the string with blob and size)
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
    const engine = new sha1();
    return engine.update(filePrefix)
        .update(file)
        .digest("hex");
}

/**
 * Hash a file. Consistent within a session, but should not be persisted and
 * is not consistent with git.
 *
 * @param file - The contents of the file in a buffer
 * @returns The hash of the content of the buffer
 */
export async function hashFile(file: Buffer): Promise<string> {
    // Use the browser native Web Crypto API when available for perf
    // Node doesn't support this API and doesn't appear to have any interest in doing so:
    // https://github.com/nodejs/node/issues/2833
    if (typeof crypto !== "object" || crypto === null) {
        const engine = new sha1();
        return engine.update(file).digest("hex");
    }

    // Fallback to sha.js library if subtlecrypto fails for whatever reason
    return Promise.resolve(crypto.subtle.digest("SHA-1", file)).then((hash) => {
        const hashArray = new Uint8Array(hash);
        const hashHex = Array.prototype.map.call(hashArray, function(byte) {
            return byte.toString(16).padStart(2, "0");
        }).join("");

        return hashHex;
    }).catch((error) => {
        return gitHashFile(file);
    });
}

/**
 * Async version of gitHashFileSync
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export async function gitHashFileAsync(file: Buffer): Promise<string> {
    // Use the browser native Web Crypto API when available for perf
    // Web Crypto doesn't support incremental hashing, so we need to do some buffer copying
    // for the git prefix, but the perf gains from native code offset that
    // Node doesn't support this API and doesn't appear to have any interest in doing so:
    // https://github.com/nodejs/node/issues/2833
    if (typeof crypto !== "object" || crypto === null) {
        return gitHashFile(file);
    }

    const size = file.byteLength;
    const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
    const prefixBuffer = Buffer.from(filePrefix, "utf-8");
    const hashBuffer = Buffer.concat([prefixBuffer, file], prefixBuffer.length + file.length);

    return hashFile(hashBuffer);
}
