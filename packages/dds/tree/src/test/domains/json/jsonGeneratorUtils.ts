/**
 * This file contains a series of utility functions intended to assist with generating random data.
 */

import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";

const englishAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function getRandomStringByCharCode(random = makeRandom(), minLen: number, maxLen: number,
    charCodeMin: number, charCodeMax: number) {
    const stringLength = (minLen < maxLen) ? random.integer(minLen, maxLen) : minLen;
    let string = "";
    for (let i = 0; i < stringLength; i++) {
        string += String.fromCharCode(charCodeMin + random.real() * (charCodeMax - charCodeMin + 1));
    }
    return string;
}

// Returns either an alphanumeric string or an alpha string within the specified length range
export function getRandomEnglishString(random = makeRandom(), includeNumbers: boolean, minLen: number, maxLen: number) {
    const stringLength = (minLen < maxLen) ? random.integer(minLen, maxLen) : minLen;
    if (includeNumbers) {
        return random.string(stringLength);
    } else {
        return random.string(stringLength, englishAlphabet);
    }
}

export function getRandomNumberString(random = makeRandom(), minLen: number, maxLen: number) {
    return getRandomStringByCharCode(random, minLen, maxLen, 0x0030, 0x0039);
}

export function getSizeInBytes(obj: unknown) {
    let str = null;
    if (typeof obj === "string") {
        str = obj;
    } else {
        str = JSON.stringify(obj);
    }
    // Get the length of the Uint8Array
    const bytes = new TextEncoder().encode(str).length;
    return bytes;
}
