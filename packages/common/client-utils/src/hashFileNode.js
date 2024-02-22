"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitHashFile = exports.hashFile = void 0;
const sha_js_1 = require("sha.js");
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
 *
 * @internal
 */
async function hashFile(file, algorithm = "SHA-1", hashEncoding = "hex") {
    let engine;
    // eslint-disable-next-line default-case
    switch (algorithm) {
        case "SHA-1": {
            engine = new sha_js_1.sha1();
            break;
        }
        case "SHA-256": {
            engine = new sha_js_1.sha256();
            break;
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return engine.update(file).digest(hashEncoding);
}
exports.hashFile = hashFile;
/**
 * Create a github hash (Github hashes the string with blob and size)
 * Must be called under secure context for browsers
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 *
 * @internal
 */
async function gitHashFile(file) {
    const size = file.byteLength;
    // eslint-disable-next-line unicorn/prefer-code-point
    const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
    const engine = new sha_js_1.sha1();
    return engine.update(filePrefix).update(file).digest("hex");
}
exports.gitHashFile = gitHashFile;
//# sourceMappingURL=hashFileNode.js.map