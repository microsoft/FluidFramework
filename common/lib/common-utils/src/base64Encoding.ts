/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "./indexNode";

export const fromBase64ToUtf8 = (input: string): string => IsoBuffer.from(input, "base64").toString("utf-8");

export const fromUtf8ToBase64 = (input: string): string => IsoBuffer.from(input, "utf8").toString("base64");

/**
 * Convenience function to convert unknown encoding to utf8 that avoids
 * buffer copies/encode ops when no conversion is needed
 * @param input - The source string to convert
 * @param encoding - The source string's encoding
 */
export const toUtf8 = (input: string, encoding: string): string => {
    switch (encoding) {
        case "utf8":
        case "utf-8":
            return input;
        default:
            return IsoBuffer.from(input, encoding).toString();
    }
};
