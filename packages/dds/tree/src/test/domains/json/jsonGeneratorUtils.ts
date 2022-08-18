/**
 * This file contains a series of utility functions intended to assist with generating random data.
 */

import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { Word } from "./twitter";

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
        currWord = nextWordChoices[Math.floor(random.integer(0, nextWordChoices.length - 1))];
        sentence += ` ${currWord}`;
        currWordCount++;
    }

    return sentence;
}

export function markovChainBuilderV2(sentences: Word[][]) {
    // 1. Build a dictionary as you traverse the sentences.
    // const dictionary: Map<string, number> = new Map();
    // const markovChain: Map<string, number[]> = new Map();
    const markovChain: Map<string, Word[]> = new Map();
    sentences.forEach((sentence) => {
        let prevWord: string | null = null;
        sentence.forEach((word) => {
            if (prevWord === null) {
                prevWord = word.value;
                if (markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)) {
                    markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!.push({ value: word.value, alphabet: word.alphabet });
                } else {
                    markovChain.set(MARKOV_SENTENCE_BEGIN_KEY, []);
                }
            }

            if (!markovChain.get(word.value)) {
                markovChain.set(word.value, []);
            }

            if (word.value !== prevWord) {
                markovChain.get(prevWord)?.push({ value: word.value, alphabet: word.alphabet });
                prevWord = word.value;
            }
        });
    });

    return markovChain;
}

export function buildTextFromMarkovChainV2(markovChain: Map<string, Word[]>, random: IRandom, wordCount: number) {
    if (markovChain.size === 0 || !markovChain.get(MARKOV_SENTENCE_BEGIN_KEY) === undefined) {
        return "";
    }

    let sentence = "";
    const rootWordChoices = markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!;
    if (rootWordChoices.length === 0) {
        throw Error("Provided markov chain because it has no root words");
    }
    const rootWord: Word = rootWordChoices[random.integer(0, rootWordChoices.length - 1)];

    sentence += rootWord.value;
    let currWord = rootWord;
    let prevWord: Word | null = null;
    let lastKnownAlphabet = currWord.alphabet;
    let nextWordChoices = markovChain.get(currWord.value)!;
    while (nextWordChoices.length !== 0) {
        prevWord = currWord;
        lastKnownAlphabet = currWord.alphabet !== "Unknown" ? currWord.alphabet : lastKnownAlphabet;
        currWord = nextWordChoices[Math.floor(random.integer(0, nextWordChoices.length - 1))];

        if (lastKnownAlphabet === "Japanese") {
            sentence += `${currWord.value}`;
        } else {
            sentence += ` ${currWord.value}`;
        }

        nextWordChoices = markovChain.get(currWord.value)!;
    }

    return sentence;
}

// -----------------------------------------------------------------------------

export function buildTextFromMarkovChainV3(markovChain: Map<string, string[]>, random: IRandom) {
    if (markovChain.size === 0 || !markovChain.get(MARKOV_SENTENCE_BEGIN_KEY) === undefined) {
        return "";
    }

    let sentence = "";
    const rootWordChoices = markovChain.get(MARKOV_SENTENCE_BEGIN_KEY)!;
    if (rootWordChoices.length === 0) {
        throw Error("Provided markov chain because it has no root words");
    }
    const rootWord = rootWordChoices[random.integer(0, rootWordChoices.length - 1)];

    sentence += rootWord;
    let currWord = rootWord;
    let prevWord: string | null = null;
    let lastKnownSpacing = assumeWordLanguageSpacing(currWord);
    let nextWordChoices = markovChain.get(currWord)!;
    while (nextWordChoices.length !== 0) {
        currWord = nextWordChoices[Math.floor(random.integer(0, nextWordChoices.length - 1))];
        if (lastKnownSpacing === "NO_SPACES") {
            sentence += `${currWord}`;
        } else {
            sentence += ` ${currWord}`;
        }

        nextWordChoices = markovChain.get(currWord)!;
        prevWord = currWord;
        lastKnownSpacing = assumeWordLanguageSpacing(currWord);
    }

    return sentence;
}

function assumeWordLanguageSpacing(word: string): "SPACED" | "NO_SPACES" | "UNKNOWN" {
    let spacedCount = 0;
    let unspacedCount = 0;
    let unknownCount = 0;
    for (let i = 0; i < word.length; i++) {
        if (getCharacaterSpacing(word.charAt(i)) === "SPACED") {
            spacedCount++;
        } else if (getCharacaterSpacing(word.charAt(i)) === "NO_SPACES") {
            unspacedCount++;
        } else {
            unknownCount++;
        }
    }

    if (spacedCount >= unspacedCount) {
        return "SPACED";
    }

    if (spacedCount < unspacedCount) {
        return "NO_SPACES";
    }

    // Will return if spacedCount + unspacedCount === 0
    return "UNKNOWN";
}

function getCharacaterSpacing(character: string): "SPACED" | "NO_SPACES" | "UNKNOWN" {
    // Latin without symbols & numbers
    // range 1: ABCDEFGHIJKLMNO0050PQRSTUVWXYZ
    if (character >= "\u0041" && character <= "\u005A"
        // range 2: abcdefghijklmnopqrstuvwxyz
        || character >= "\u0061" && character <= "\u007A") {
        return "SPACED";
    }

    // // Symbols
    // // range 1: !"#$%&'()*+,-./
    // if (character >= "\u0021" && character <= "\u002F"
    // // Range 2: :;<=>?@
    // || character >= "\u003A" && character <= "\u0041"
    // // Range 3: [\]^_`
    // || character >= "\u005B" && character <= "\u0060"
    // // Range 4: {|}~
    // || character >= "\u007B" && character <= "\u007E") {
    //     return "UNKNOWN";
    // }

    // CJK Unified Ideographs (also, Japanese Kanji Alphabet)
    if (character >= "\u4E00" && character <= "\u9FBF"
        // Japanese Katakana Alphabet
        || character >= "\u30F3" && character <= "\u30AA"
        // Japanese Hiragana Alphabet
        || character >= "\u304B" && character <= "\u3087") {
        return "NO_SPACES";
    }

    return "UNKNOWN";
}

/* eslint-enable */
