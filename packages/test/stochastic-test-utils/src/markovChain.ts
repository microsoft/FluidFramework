import { IRandom } from "./types";

abstract class MarkovChain {
    protected static readonly MARKOV_SENTENCE_BEGIN_KEY = "MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#";
    public abstract initialize(predicitionPoints: string[][]): void;
    public abstract generateSentence(predicitionPoints: string[][]): string;

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
    readonly chain: Map<string, Map<string, number>>;
    readonly random: IRandom;

    constructor(random: IRandom, chain?: Map<string, Map<string, number>>) {
        super();
        if (chain) {
            this.chain = chain;
        } else {
            this.chain = new Map();
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
            sentence.forEach((word) => {
                // This case will occur at the beginning of a sentence which is why the given word is added to the
                // MARKOV_SENTENCE_BEGIN_KEY within the markov chain.
                if (prevWord === null) {
                    prevWord = word;
                    const markovChainRoot = this.chain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY);
                    if (markovChainRoot) {
                        const currentCount = markovChainRoot.get(word);
                        if (currentCount !== undefined) {
                            markovChainRoot.set(word, currentCount + 1);
                        } else {
                            markovChainRoot.set(word, 1);
                        }
                    } else {
                        this.chain.set(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY, new Map());
                    }
                }

                if (!this.chain.get(word)) {
                    this.chain.set(word, new Map());
                }

                if (word !== prevWord) {
                    const currentWordCount = this.chain.get(prevWord)?.get(word);
                    if (currentWordCount !== undefined) {
                        this.chain.get(prevWord)?.set(word, currentWordCount + 1);
                    } else {
                        this.chain.get(prevWord)?.set(word, 1);
                    }
                    prevWord = word;
                }
            });
        });
    }

    public generateSentence() {
        const markovChain = this.chain;
        if (markovChain.size === 0 || markovChain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY) === undefined) {
            return "";
        }

        let sentence = "";
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const rootWordChoices = markovChain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY)!;
        if (rootWordChoices.size === 0) {
            throw Error("Provided markov chain because it has no root words");
        }
        const rootWord = this.randomlySelectWord(rootWordChoices);

        sentence += rootWord;
        let currWord = rootWord;
        let lastKnownSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let nextWordChoices = markovChain.get(currWord)!;
        while (nextWordChoices.size !== 0) {
            currWord = this.randomlySelectWord(nextWordChoices);
            if (lastKnownSpacing === "NO_SPACES") {
                sentence += `${currWord}`;
            } else {
                sentence += ` ${currWord}`;
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            nextWordChoices = markovChain.get(currWord)!;
            lastKnownSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        }

        return sentence;
    }

    private randomlySelectWord(wordOccuranceMap: Map<string, number>) {
        const wordChoices: string[] = [];
        wordOccuranceMap.forEach((occuranceCount, word) => {
            for (let i = 0; i < occuranceCount; i++) {
                wordChoices.push(word);
            }
        });
        return wordChoices[this.random.integer(0, wordChoices.length - 1)];
    }
}

export class PerformanceMarkovChain extends MarkovChain {
    readonly chain: Map<string, string[]>;
    readonly random: IRandom;

    constructor(random: IRandom, chain?: Map<string, string[]>) {
        super();
        if (chain) {
            this.chain = chain;
        } else {
            this.chain = new Map();
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
            sentence.forEach((word) => {
                if (prevWord === null) {
                    prevWord = word;
                    const rootWords = this.chain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY);
                    if (rootWords) {
                        rootWords.push(word);
                    } else {
                        this.chain.set(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY, []);
                    }
                }

                if (!this.chain.get(word)) {
                    this.chain.set(word, []);
                }

                if (word !== prevWord) {
                    this.chain.get(prevWord)?.push(word);
                    prevWord = word;
                }
            });
        });

        return this.chain;
    }

    public generateSentence() {
        if (this.chain.size === 0 || this.chain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY) === undefined) {
            return "";
        }

        let sentence = "";
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const rootWordChoices = this.chain.get(MarkovChain.MARKOV_SENTENCE_BEGIN_KEY)!;
        if (rootWordChoices.length === 0) {
            throw Error("Provided markov chain because it has no root words");
        }

        const rootWord = rootWordChoices[this.random.integer(0, rootWordChoices.length - 1)];
        sentence += rootWord;
        let currWord = rootWord;
        let lastKnownSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let nextWordChoices = this.chain.get(currWord)!;
        while (nextWordChoices.length !== 0) {
            currWord = nextWordChoices[Math.floor(this.random.integer(0, nextWordChoices.length - 1))];
            if (lastKnownSpacing === "NO_SPACES") {
                sentence += `${currWord}`;
            } else {
                sentence += ` ${currWord}`;
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            nextWordChoices = this.chain.get(currWord)!;
            lastKnownSpacing = MarkovChain.assumeWordLanguageSpacing(currWord);
        }

        return sentence;
    }
}
