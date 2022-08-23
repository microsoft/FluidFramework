import { strict as assert } from "assert";
import { PerformanceMarkovChain, SpaceEfficientMarkovChain } from "../markovChain";
import { makeRandom } from "../random";

const testSentences = [
    ["hello", "my", "name", "is", "sean"],
    ["hello", "my", "dog", "is", "ozzie"],
    ["hello", "there", "my", "friend"],
    ["my", "what", "a", "day"],
    ["yaht", "yaht", "yaht"],
    ["my"],
];

const wordArrayToWordCount = (words: string[]) => {
    const result: Record<string, number> = {};
    words.forEach((word) => {
        if (result[word]) {
            result[word] += 1;
        } else {
            result[word] = 1;
        }
    });
    return result;
};

describe("MarkovChain", () => {
    describe("SpaceEfficientMarkovChain", () => {
        it("initialize() - correctly forms a markov chain", () => {
            const markovChain = new SpaceEfficientMarkovChain();
            markovChain.initialize(testSentences);
            assert.strictEqual(markovChain.chain !== undefined, true);
            assert.deepEqual(markovChain.chain[SpaceEfficientMarkovChain.MARKOV_SENTENCE_BEGIN_KEY],
                {
                    hello: 3,
                    my: 2,
                    yaht: 1,
                });
            assert.deepEqual(markovChain.chain.hello,
                {
                    my: 2,
                    there: 1,
                });
            assert.deepEqual(markovChain.chain.my,
                {
                    name: 1,
                    dog: 1,
                    friend: 1,
                    what: 1,
                    [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
            assert.deepEqual(markovChain.chain.name, { is: 1 });
            assert.deepEqual(markovChain.chain.is,
                {
                    sean: 1,
                    ozzie: 1,
                });
            assert.deepEqual(markovChain.chain.sean, { [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(markovChain.chain.dog, { is: 1 });
            assert.deepEqual(markovChain.chain.ozzie, { [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(markovChain.chain.there, { my: 1 });
            assert.deepEqual(markovChain.chain.friend, { [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(markovChain.chain.what, { a: 1 });
            assert.deepEqual(markovChain.chain.day, { [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(markovChain.chain.yaht,
                {
                    yaht: 2,
                    [SpaceEfficientMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
        });

        it("generateSentence() - creates sentence with expected words", () => {
            const markovChain = new SpaceEfficientMarkovChain();
            markovChain.initialize(testSentences);
            const generatedSentences: string[] = [];
            for (let i = 0; i < 15; i++) {
                generatedSentences.push(markovChain.generateSentence(30));
            }

            const expectedWordChoices = new Set<string>();
            testSentences.forEach((sentence) => {
                sentence.forEach((word) => expectedWordChoices.add(word));
            });

            generatedSentences.forEach((sentence) => {
                assert.ok(sentence.length < 30);
                sentence.split(" ").forEach((word) => assert.ok(expectedWordChoices.has(word)));
            });
        });

        it("constructor() - correctly forms a markov chain", () => {
            const originalChain = new SpaceEfficientMarkovChain();
            originalChain.initialize(testSentences);
            const chainFromExistingChain = new SpaceEfficientMarkovChain(makeRandom(), originalChain.chain);
            assert.deepEqual(originalChain.chain, chainFromExistingChain.chain);
        });
    });

    describe("PerformanceMarkovChain", () => {
        it("initialize() - correctly forms a markov chain", () => {
            const markovChain = new PerformanceMarkovChain();
            markovChain.initialize(testSentences);
            assert.strictEqual(markovChain.chain !== undefined, true);
            assert.deepEqual(wordArrayToWordCount(markovChain.chain[PerformanceMarkovChain.MARKOV_SENTENCE_BEGIN_KEY]),
                {
                    hello: 3,
                    my: 2,
                    yaht: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.hello),
                {
                    my: 2,
                    there: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.my),
                {
                    name: 1,
                    dog: 1,
                    friend: 1,
                    what: 1,
                    [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.name), { is: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.is),
                {
                    sean: 1,
                    ozzie: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.sean),
                { [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.dog), { is: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.ozzie),
                { [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.there), { my: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.friend),
                { [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.what), { a: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.day),
                { [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.yaht),
                {
                    yaht: 2,
                    [PerformanceMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
        });

        it("generateSentence() - creates sentence with expected words", () => {
            const markovChain = new PerformanceMarkovChain();
            markovChain.initialize(testSentences);
            const generatedSentences: string[] = [];
            for (let i = 0; i < 15; i++) {
                generatedSentences.push(markovChain.generateSentence(30));
            }
            const expectedWordChoices = new Set<string>();
            testSentences.forEach((sentence) => {
                sentence.forEach((word) => expectedWordChoices.add(word));
            });

            generatedSentences.forEach((sentence) => {
                assert.ok(sentence.length < 30);
                sentence.split(" ").forEach((word) => assert.ok(expectedWordChoices.has(word)));
            });
        });

        it("constructor() - correctly forms a markov chain", () => {
            const originalChain = new PerformanceMarkovChain();
            originalChain.initialize(testSentences);
            const chainFromExistingChain = new PerformanceMarkovChain(makeRandom(), originalChain.chain);
            assert.deepEqual(originalChain.chain, chainFromExistingChain.chain);
        });
    });
});
