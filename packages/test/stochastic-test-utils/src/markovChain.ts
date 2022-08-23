import { makeRandom } from "./random";
import { IRandom } from "./types";

abstract class MarkovChain {
    public static readonly MARKOV_SENTENCE_BEGIN_KEY = "MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#";
    public static readonly MARKOV_SENTENCE_END_KEY = "MARKOV_SENTENCE_END_KEY_01$#@%^#";
    public abstract initialize(predicitionPoints: string[][]): void;
    public abstract generateSentence(...args: any): string;

    protected static assumeWordLanguageSpacing(word: string): "SPACED" | "NO_SPACES" | "UNKNOWN" {
        let spacedCount = 0;
        let unspacedCount = 0;
        for (let i = 0; i < word.length; i++) {
            if (MarkovChain.getCharacaterSpacing(word.charAt(i)) === "SPACED") {
                spacedCount++;
            } else if (MarkovChain.getCharacaterSpacing(word.charAt(i)) === "NO_SPACES") {
                unspacedCount++;
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

    // Todo: Add support for more languages
    protected static getCharacaterSpacing(character: string): "SPACED" | "NO_SPACES" | "UNKNOWN" {
        // Latin without symbols & numbers
        // range 1: ABCDEFGHIJKLMNO0050PQRSTUVWXYZ
        if (character >= "\u0041" && character <= "\u005A"
            // range 2: abcdefghijklmnopqrstuvwxyz
            || character >= "\u0061" && character <= "\u007A") {
            return "SPACED";
        }
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
}

export class SpaceEfficientMarkovChain extends MarkovChain {
    readonly chain: Record<string, Record<string, number>>;
    readonly random: IRandom;

    constructor(random: IRandom = makeRandom(1), chain?: Record<string, Record<string, number>>) {
        super();
        if (chain) {
            this.chain = chain;
        } else {
            this.chain = {};
        }

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
                    this.chain[word] = {};
                }

                // This case will occur at the beginning of a sentence which is why the given word is added to the
                // MARKOV_SENTENCE_BEGIN_KEY within the markov chain.
                if (i === 0) {
                    prevWord = word;
                    const markovChainRoot = this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY];
                    if (markovChainRoot !== undefined) {
                        const currentCount = markovChainRoot[word];
                        if (currentCount !== undefined) {
                            markovChainRoot[word] = currentCount + 1;
                        } else {
                            markovChainRoot[word] = 1;
                        }
                    } else {
                        this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] = { [word]: 1 };
                    }
                } else if (prevWord !== null) {
                    if (i === sentence.length - 1) {
                        if (this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] !== undefined) {
                            this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] += 1;
                        } else {
                            this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] = 1;
                        }
                    }

                    const currentWordCount = this.chain[prevWord][word];
                    if (currentWordCount !== undefined) {
                        this.chain[prevWord][word] = currentWordCount + 1;
                    } else {
                        this.chain[prevWord][word] = 1;
                    }
                    prevWord = word;
                }
            }

            if (sentence.length === 1) {
                const word = sentence[0];
                if (this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] !== undefined) {
                    this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] += 1;
                } else {
                    this.chain[word][MarkovChain.MARKOV_SENTENCE_END_KEY] = 1;
                }
            }
        });
    }

    /**
     * Runtime per word added to the generated sentence: O(totalNumberOfWordChoices) + O(wordLength)
     * @returns A sentence generated using the given class instances markov chain.
     */
    public generateSentence(maxLength: number) {
        const markovChain = this.chain;
        if (Object.keys(markovChain).length === 0 || markovChain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] === undefined) {
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
        let currWordSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        let prevWordSpacing = currWordSpacing;
        let nextWordChoices = markovChain[currWord];
        while (sentence.length < maxLength && Object.keys(nextWordChoices).length !== 0) {
            prevWordSpacing = currWordSpacing;
            currWord = this.randomlySelectWord(nextWordChoices);
            if (currWord === MarkovChain.MARKOV_SENTENCE_END_KEY) {
                break;
            }
            currWordSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);

            if (currWordSpacing === "UNKNOWN") {
                if (prevWordSpacing === "NO_SPACES") {
                    sentence += `${currWord}`;
                } else {
                    sentence += ` ${currWord}`;
                }
            } else if (currWordSpacing === "NO_SPACES") {
                sentence += `${currWord}`;
            } else if (currWordSpacing === "SPACED") {
                sentence += ` ${currWord}`;
            }

            nextWordChoices = markovChain[currWord];
        }

        return sentence;
    }

    private randomlySelectWord(wordOccuranceMap: Record<string, number>) {
        const wordChoices: string[] = [];
        Object.entries(wordOccuranceMap).forEach(([word, occuranceCount]) => {
            for (let i = 0; i < occuranceCount; i++) {
                wordChoices.push(word);
            }
        });
        return wordChoices[this.random.integer(0, wordChoices.length - 1)];
    }
}

export class PerformanceMarkovChain extends MarkovChain {
    readonly chain: Record<string, string[]>;
    readonly random: IRandom;

    constructor(random: IRandom = makeRandom(1), chain?: Record<string, string[]>) {
        super();
        if (chain) {
            this.chain = chain;
        } else {
            this.chain = {};
        }
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
    public generateSentence(maxLength: number) {
        if (Object.keys(this.chain).length === 0 || this.chain[MarkovChain.MARKOV_SENTENCE_BEGIN_KEY] === undefined) {
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
        let currWordSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        let prevWordSpacing = currWordSpacing;
        // let lastKnownSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        let nextWordChoices = this.chain[currWord];
        while (sentence.length < maxLength && nextWordChoices.length !== 0) {
            prevWordSpacing = currWordSpacing;
            currWord = nextWordChoices[Math.floor(this.random.integer(0, nextWordChoices.length - 1))];
            if (currWord === MarkovChain.MARKOV_SENTENCE_END_KEY) {
                break;
            }
            currWordSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
            if (currWordSpacing === "UNKNOWN") {
                if (prevWordSpacing === "NO_SPACES") {
                    sentence += `${currWord}`;
                } else {
                    sentence += ` ${currWord}`;
                }
            } else if (currWordSpacing === "NO_SPACES") {
                sentence += `${currWord}`;
            } else if (currWordSpacing === "SPACED") {
                sentence += ` ${currWord}`;
            }
            nextWordChoices = this.chain[currWord];
        }

        return sentence;
    }
}
