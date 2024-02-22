"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUtf8 = exports.fromUtf8ToBase64 = exports.fromBase64ToUtf8 = void 0;
const indexNode_js_1 = require("./indexNode.js");
/**
 * Converts the provided {@link https://en.wikipedia.org/wiki/Base64 | base64}-encoded string
 * to {@link https://en.wikipedia.org/wiki/UTF-8 | utf-8}.
 *
 * @internal
 */
const fromBase64ToUtf8 = (input) => indexNode_js_1.IsoBuffer.from(input, "base64").toString("utf8");
exports.fromBase64ToUtf8 = fromBase64ToUtf8;
/**
 * Converts the provided {@link https://en.wikipedia.org/wiki/UTF-8 | utf-8}-encoded string
 * to {@link https://en.wikipedia.org/wiki/Base64 | base64}.
 *
 * @internal
 */
const fromUtf8ToBase64 = (input) => indexNode_js_1.IsoBuffer.from(input, "utf8").toString("base64");
exports.fromUtf8ToBase64 = fromUtf8ToBase64;
/**
 * Convenience function to convert unknown encoding to utf8 that avoids
 * buffer copies/encode ops when no conversion is needed.
 * @param input - The source string to convert.
 * @param encoding - The source string's encoding.
 *
 * @internal
 */
const toUtf8 = (input, encoding) => {
    switch (encoding) {
        case "utf8":
        // eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
        case "utf-8": {
            return input;
        }
        default: {
            return indexNode_js_1.IsoBuffer.from(input, encoding).toString();
        }
    }
};
exports.toUtf8 = toUtf8;
//# sourceMappingURL=base64Encoding.js.map