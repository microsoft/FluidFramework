/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function fromBase64ToUtf8(input: string): string {
    return Buffer.from(input, "base64").toString("utf-8");
}

export function fromUtf8ToBase64(input: string): string {
    return Buffer.from(input, "utf8").toString("base64");
}
