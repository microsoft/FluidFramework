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
