/**
 * This file contains a series of utility functions intended to assist with generating random data.
 */

// returns a decimal number between inclusive of the min and max provided
export function getRandomNumber(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

export function getRandomStringByCharCode(minLen: number, maxLen: number, charCodeMin: number, charCodeMax: number) {
    const stringLength = (minLen < maxLen) ? getRandomNumber(minLen, maxLen) : minLen;
    let string = "";
    for (let i = 0; i < stringLength; i++) {
        string += String.fromCharCode(charCodeMin + Math.random() * (charCodeMax - charCodeMin + 1));
    }
    return string;
}

// Returns either an alphanumeric string or an alpha string within the specified length range
export function getRandomEnglishString(includeNumbers: boolean, minLen: number, maxLen: number) {
    if (includeNumbers) {
        return Math.random().toString(36).substring(2, getRandomNumber(minLen, maxLen));
    } else {
        return getRandomStringByCharCode(minLen, maxLen, 0x0041, 0x007A);
    }
}

export function getRandomNumberString(minLen: number, maxLen: number) {
    return getRandomStringByCharCode(minLen, maxLen, 0x0030, 0x0039);
}

export function getRandomBoolean() {
    return Math.random() === 1 ? true : false;
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
