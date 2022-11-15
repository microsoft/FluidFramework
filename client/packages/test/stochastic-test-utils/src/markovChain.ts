/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createWeightedGenerator } from "./generators";
import { makeRandom } from "./random";
import { IRandom } from "./types";

export abstract class MarkovChain<PredictionPointType, OutputType> {
    public static readonly MARKOV_SENTENCE_BEGIN_KEY = "MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#";
    public static readonly MARKOV_SENTENCE_END_KEY = "MARKOV_SENTENCE_END_KEY_01$#@%^#";
    public abstract initialize(predicitionPoints: PredictionPointType[][]): void;
    public abstract generateData(...args: any): OutputType;

    protected static assumeWordLanguageWordSpacing(word: string): WordSpacing {
        let spacedCount = 0;
        let unspacedCount = 0;
        for (let i = 0; i < word.length; i++) {
            if (MarkovChain.getCharacaterWordSpacing(word.charAt(i)) === WordSpacing.Spaced) {
                spacedCount++;
            } else if (MarkovChain.getCharacaterWordSpacing(word.charAt(i)) === WordSpacing.Unspaced) {
                unspacedCount++;
            }
        }

        if (spacedCount >= unspacedCount) {
            return WordSpacing.Spaced;
        }
        if (spacedCount < unspacedCount) {
            return WordSpacing.Unspaced;
        }
        // Will return if spacedCount + unspacedCount === 0
        return WordSpacing.Unknown;
    }

    // Todo: Add support for more languages
    protected static getCharacaterWordSpacing(character: string): WordSpacing {
        // Latin without symbols & numbers
        // range 1: ABCDEFGHIJKLMNOPQRSTUVWXYZ
        if (character >= "\u0041" && character <= "\u005A"
            // range 2: abcdefghijklmnopqrstuvwxyz
            || character >= "\u0061" && character <= "\u007A") {
            return WordSpacing.Spaced;
        }
        // CJK Unified Ideographs (also, Japanese Kanji Alphabet)
        if (character >= "\u4E00" && character <= "\u9FBF"
            // Japanese Katakana Alphabet
            || character >= "\u30F3" && character <= "\u30AA"
            // Japanese Hiragana Alphabet
            || character >= "\u304B" && character <= "\u3087") {
            return WordSpacing.Unspaced;
        }
        return WordSpacing.Unknown;
    }
}

export enum WordSpacing {
    Spaced,
    Unspaced,
    Unknown,
}

export class SpaceEfficientWordMarkovChain extends MarkovChain<string, string> {
    chain: Record<string, [string, number][]>;
    readonly random: IRandom;

    constructor(random: IRandom = makeRandom(1), chain?: Record<string, [string, number][]>) {
        super();
        this.chain = chain ? chain : {};

        this.random = random;
    }

    /**
     * Initializes a markovChain given a 2d array of sentences.
     * @param sentences - A sentence is an array of string words, sentences is an array of sentences.
     */
    public initialize(sentences: string[][]) {
        const initialChain: Record<string, Record<string, number>> = {};
        sentences.forEach((sentence) => {
            let prevWord: string | null = null;
            for (let i = 0; i < sentence.length; i++) {
                const word = sentence[i];
                if (initialChain[word] === undefined) {
                    initialChain[word] = {};
                }

                // This case will occur at the beginning of a sentence which is why the given word is added to the
                // MARKOV_SENTENCE_BEGIN_KEY within the markov chain.
                if (i === 0) {
                    prevWord = word;
                    const markovChainRoot = initialChain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY];
                    if (markovChainRoot !== undefined) {
                        const currentCount = markovChainRoot[word];
                        if (currentCount !== undefined) {
                            markovChainRoot[word] = currentCount + 1;
                        } else {
                            markovChainRoot[word] = 1;
                        }
                    } else {
                        initialChain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] = { [word]: 1 };
                    }
                } else if (prevWord !== null) {
                    if (i === sentence.length - 1) {
                        if (initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] !== undefined) {
                            initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] += 1;
                        } else {
                            initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] = 1;
                        }
                    }

                    const currentWordCount = initialChain[prevWord][word];
                    if (currentWordCount !== undefined) {
                        initialChain[prevWord][word] = currentWordCount + 1;
                    } else {
                        initialChain[prevWord][word] = 1;
                    }
                    prevWord = word;
                }
            }

            if (sentence.length === 1) {
                const word = sentence[0];
                if (initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] !== undefined) {
                    initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] += 1;
                } else {
                    initialChain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] = 1;
                }
            }
        });

        const weightedGeneratorReadyChain: Record<string, [string, number][]> = {};
        Object.keys(initialChain).forEach((key) => {
            weightedGeneratorReadyChain[key] = [];
            Object.keys(initialChain[key]).forEach((innerKey) => {
                weightedGeneratorReadyChain[key].push([innerKey, initialChain[key][innerKey]]);
            });
        });
        this.chain = weightedGeneratorReadyChain;
    }

    /**
     * Runtime per word added to the generated sentence: O(totalNumberOfWordChoices) + O(wordLength)
     * @returns A sentence generated using the given class instances markov chain.
     */
    public generateData(maxLength: number) {
        const markovChain = this.chain;
        if (Object.keys(markovChain).length === 0
            || markovChain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] === undefined) {
            return "";
        }

        let sentence = "";
        const rootWordChoices = markovChain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY];
        if (Object.keys(rootWordChoices).length === 0) {
            throw Error("Provided markov chain because it has no root words");
        }
        const rootWord = this.randomlySelectWord(rootWordChoices);

        sentence += rootWord;
        let currWord = rootWord;
        let currWordSpacing = MarkovChain.assumeWordLanguageWordSpacing(currWord);
        let prevWordSpacing = currWordSpacing;
        let nextWordChoices = markovChain[currWord];
        while (sentence.length < maxLength && Object.keys(nextWordChoices).length !== 0) {
            prevWordSpacing = currWordSpacing;
            currWord = this.randomlySelectWord(nextWordChoices);
            if (currWord === MarkovChain.MARKOV_SENTENCE_END_KEY) {
                break;
            }
            currWordSpacing = MarkovChain.assumeWordLanguageWordSpacing(currWord);

            switch (currWordSpacing) {
                case WordSpacing.Unknown: {
                    sentence += prevWordSpacing === WordSpacing.Unspaced ? `${currWord}` : ` ${currWord}`;
                    break;
                }
                case WordSpacing.Unspaced: {
                    sentence += `${currWord}`;
                    break;
                }
                case WordSpacing.Spaced: {
                    sentence += ` ${currWord}`;
                    break;
                }
                default:
                    break;
            }

            nextWordChoices = markovChain[currWord];
        }

        return sentence;
    }

    private randomlySelectWord(wordOccuranceMap: [string, number][]) {
        const weightGenerator = createWeightedGenerator(wordOccuranceMap);
        return weightGenerator({ random: this.random }) as string;
    }
}

export class PerformanceWordMarkovChain extends MarkovChain<string, string> {
    readonly chain: Record<string, string[]>;
    readonly random: IRandom;

    constructor(random: IRandom = makeRandom(1), chain?: Record<string, string[]>) {
        super();
        this.chain = chain ? chain : {};
        this.random = random;
    }

    /**
     * Initializes a markovChain given a 2d array of sentences.
     * @param sentences - A sentence is an array of string words, sentences is an array of sentences.
     */
    public initialize(sentences: string[][]) {
        sentences.forEach((sentence) => {
            let prevWord: string | null = null;
            for (let i = 0; i < sentence.length; i++) {
                const word = sentence[i];
                if (this.chain[word] === undefined) {
                    this.chain[word] = [];
                }
                // This case will occur at the beginning of a sentence which is why the given word is added to the
                // MARKOV_SENTENCE_BEGIN_KEY within the markov chain.
                if (i === 0) {
                    prevWord = word;
                    const markovChainRoot = this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY];
                    if (markovChainRoot !== undefined) {
                        markovChainRoot.push(word);
                    } else {
                        this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] = [word];
                    }
                } else if (prevWord !== null) {
                    if (i === sentence.length - 1) {
                        this.chain[word].push(MarkovChain.MARKOV_SENTENCE_END_KEY);
                    }
                    this.chain[prevWord].push(word);
                    prevWord = word;
                }
            }

            if (sentence.length === 1) {
                const word = sentence[0];
                this.chain[word].push(MarkovChain.MARKOV_SENTENCE_END_KEY);
            }
        });

        return this.chain;
    }

    /**
     * Runtime per word added to the generated sentence: O(1) + O(wordLength).
     * @returns A sentence generated using the given class instances markov chain.
     */
    public generateData(maxLength: number) {
        if (Object.keys(this.chain).length === 0
            || this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] === undefined) {
            return "";
        }

        let sentence = "";
        const rootWordChoices = this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY];
        if (Object.keys(rootWordChoices).length === 0) {
            throw Error("Provided markov chain because it has no root words");
        }

        const rootWord = rootWordChoices[this.random.integer(0, rootWordChoices.length - 1)];
        sentence += rootWord;
        let currWord = rootWord;
        let currWordSpacing = MarkovChain.assumeWordLanguageWordSpacing(currWord);
        let prevWordSpacing = currWordSpacing;
        let nextWordChoices = this.chain[currWord];
        while (sentence.length < maxLength && nextWordChoices.length !== 0) {
            prevWordSpacing = currWordSpacing;
            currWord = nextWordChoices[Math.floor(this.random.integer(0, nextWordChoices.length - 1))];
            if (currWord === MarkovChain.MARKOV_SENTENCE_END_KEY) {
                break;
            }
            currWordSpacing = MarkovChain.assumeWordLanguageWordSpacing(currWord);
            switch (currWordSpacing) {
                case WordSpacing.Unknown: {
                    sentence += prevWordSpacing === WordSpacing.Unspaced ? `${currWord}` : ` ${currWord}`;
                    break;
                }
                case WordSpacing.Unspaced: {
                    sentence += `${currWord}`;
                    break;
                }
                case WordSpacing.Spaced: {
                    sentence += ` ${currWord}`;
                    break;
                }
                default:
                    break;
            }
            nextWordChoices = this.chain[currWord];
        }

        return sentence;
    }
}
