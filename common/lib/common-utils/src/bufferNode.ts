/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const IsoBuffer = Buffer;
export type IsoBuffer = Buffer;

export const fromBase64ToUtf8 = (input: string): string => IsoBuffer.from(input, "base64").toString();
export const fromUtf8ToBase64 = (input: string): string => IsoBuffer.from(input).toString("base64");
