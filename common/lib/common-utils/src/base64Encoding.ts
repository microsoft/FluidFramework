/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const fromBase64ToUtf8 = (input: string): string => Buffer.from(input, "base64").toString("utf-8");

export const fromUtf8ToBase64 = (input: string): string => Buffer.from(input, "utf8").toString("base64");
