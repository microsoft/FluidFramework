/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file contains a series of utility functions intended to assist with generating random data.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";

// Constructs a string containing all character in the given unicode range [charMin..charMax] (inclusive).
export function createAlphabetFromUnicodeRange(charMin: number, charMax: number) {
    let string = "";
    for (let i = charMin; i <= charMax; i++) {
        string += String.fromCodePoint(charMin + i);
    }
    return string;
}

const englishAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
// Returns either an alphanumeric string or an alpha string within the specified length range
export function getRandomEnglishString(random = makeRandom(), includeNumbers: boolean, minLen: number, maxLen: number) {
    const stringLength = (minLen < maxLen) ? random.integer(minLen, maxLen) : minLen;
    return includeNumbers
        ? random.string(stringLength)
        : random.string(stringLength, englishAlphabet);
}

const numbersString = "0123456789";
export function getRandomNumberString(random = makeRandom(), minLen: number, maxLen: number) {
    const stringLength = random.integer(minLen, maxLen);
    return random.string(stringLength, numbersString);
}

export function getSizeInBytes(obj: unknown) {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    // Get the length of the Uint8Array
    const bytes = new TextEncoder().encode(str).length;
    return bytes;
}
