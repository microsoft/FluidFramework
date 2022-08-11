/**
 * This file contains a series of utility functions intended to assist with generating random data.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { string } from "../../schema-stored/examples/SchemaExamples";

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

/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Input is expected to be a list of sentences where each sentence
// is a list of words in the same order as the original sentence
export function markovChainBuilder(sentences: string[][]) {
    // 1. Build a dictionary as you traverse the sentences.
    // const dictionary: Map<string, number> = new Map();
    // const markovChain: Map<string, number[]> = new Map();
    const markovChain: Map<string, string[]> = new Map();
    sentences.forEach((sentence) => {
        let prevWord: string | null = null;
        sentence.forEach((word) => {
            if (prevWord === null) {
                prevWord = word;
            }

            // if (!dictionary.get(word)) {
            //     dictionary.set(word, dictionary.size + 1);
            // }
            if (!markovChain.get(word)) {
                markovChain.set(word, []);
            }

            if (word !== prevWord) {
                markovChain.get(prevWord)?.push(word);
                prevWord = word;
            }
        });
    });

    return markovChain;
}

/* eslint-enable */
