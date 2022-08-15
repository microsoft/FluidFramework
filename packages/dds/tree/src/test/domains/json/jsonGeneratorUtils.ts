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

/* eslint-disable @typescript-eslint/no-non-null-assertion */
const MARKOV_SENTENCE_BEGIN_KEY = "MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#";
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
                if (markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)) {
                    markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!.push(word);
                } else {
                    markovChain.set(MARKOV_SENTENCE_BEGIN_KEY, []);
                }
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

export function buildTextFromMarkovChain(markovChain: Map<string, string[]>, random: IRandom, wordCount: number) {
    // Math.floor(random.integer(0, 99999));
    if (markovChain.size === 0 || !markovChain.get(MARKOV_SENTENCE_BEGIN_KEY) === undefined) {
        return "";
    }

    let sentence = "";
    const rootWordChoices = markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!;
    if (rootWordChoices.length === 0) {
        throw Error("Provided markov chain because it has no root words");
    }
    const rootWord = markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)![
        Math.floor(random.integer(0, markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!.length - 1))
    ];

    sentence += rootWord;
    let currWordCount = 1;
    let currWord = rootWord;
    while (currWordCount < wordCount) {
        // Issue will occur if a word with nothing after it occurs
        const nextWordChoices = markovChain.get(currWord)!;
        if (nextWordChoices.length === 0) {
            return sentence;
        }
        currWord = nextWordChoices[ Math.floor(random.integer(0, nextWordChoices.length - 1))];
        sentence += ` ${currWord}`;
        currWordCount++;
    }

    return sentence;
}
/* eslint-enable */
