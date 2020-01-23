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
 * Async version of gitHashFileSync
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export async function gitHashFileAsync(file: Buffer): Promise<string> {
    // Use the browser native Web Crypto API when available for perf
    // Web Crypto doesn't support incremental hashing, so we need to do some buffer copying
    // but the perf gains from native code offset that
    // Node doesn't support this API and doesn't appear to have any interest in doing so:
    // https://github.com/nodejs/node/issues/2833
    if (typeof crypto != "undefined") {
        const size = file.byteLength;
        const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
        const prefixBuffer = Buffer.from(filePrefix, "utf-8");
        const hashBuffer = Buffer.concat([prefixBuffer, file], prefixBuffer.length + file.length);

        const hash = await crypto.subtle.digest("SHA-1", hashBuffer);
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map((b) => {
            b.toString(16).padStart(2, "0");
        }).join("");

        return hashHex;
    } else {
        return gitHashFile(file);
    }
}
