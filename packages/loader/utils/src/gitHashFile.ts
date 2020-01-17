/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import * as sha256 from "sha.js/sha256";

/**
 * Create Hash (Github hashes the string with blob and size)
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export function gitHashFile(file: Buffer): string {
    const engine = new sha256();
    return engine.update(file).digest("hex");
}

/**
 * Async wrapper for gitHashFileSync
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export async function gitHashFileAsync(file: Buffer): Promise<string> {
    // Use the browser native Web Crypto API when available for perf
    // Node doesn't support this API and doesn't appear to have any interest in doing so:
    // https://github.com/nodejs/node/issues/2833
    if (typeof crypto != "undefined") {
        const hash = await crypto.subtle.digest("SHA-256", file);
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map((b) => {
            b.toString(16).padStart(2, "0");
        }).join("");

        return hashHex;
    } else {
        return gitHashFile(file);
    }
}
