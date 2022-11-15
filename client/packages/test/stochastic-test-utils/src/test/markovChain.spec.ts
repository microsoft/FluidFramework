/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PerformanceWordMarkovChain, SpaceEfficientWordMarkovChain } from "../markovChain";
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
    describe("SpaceEfficientWordMarkovChain", () => {
        it("initialize() - correctly forms a markov chain", () => {
            const markovChain = new SpaceEfficientWordMarkovChain();
            markovChain.initialize(testSentences);
            assert.strictEqual(markovChain.chain !== undefined, true);
            assert.deepEqual(markovChain.chain[SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_BEGIN_KEY],
                [
                    ["hello", 3],
                    ["my", 2],
                    ["yaht", 1],
                ]);
            assert.deepEqual(markovChain.chain.hello,
                [
                    ["my", 2],
                    ["there", 1],
                ]);
            assert.deepEqual(markovChain.chain.my,
                [
                    ["name", 1],
                    ["dog", 1],
                    ["friend", 1],
                    ["what", 1],
                    [SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1],
                ]);
            assert.deepEqual(markovChain.chain.name, [["is", 1]]);
            assert.deepEqual(markovChain.chain.is,
                [
                    ["sean", 1],
                    ["ozzie", 1],
                ]);
            assert.deepEqual(markovChain.chain.sean, [[SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1]]);
            assert.deepEqual(markovChain.chain.dog, [["is", 1]]);
            assert.deepEqual(markovChain.chain.ozzie, [[SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1]]);
            assert.deepEqual(markovChain.chain.there, [["my", 1]]);
            assert.deepEqual(markovChain.chain.friend, [[SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1]]);
            assert.deepEqual(markovChain.chain.what, [["a", 1]]);
            assert.deepEqual(markovChain.chain.day, [[SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1]]);
            assert.deepEqual(markovChain.chain.yaht,
                [
                    ["yaht", 2],
                    [SpaceEfficientWordMarkovChain.MARKOV_SENTENCE_END_KEY, 1],
                ]);
        });

        it("generateSentence() - creates sentence with expected words", () => {
            const markovChain = new SpaceEfficientWordMarkovChain();
            markovChain.initialize(testSentences);
            const generatedSentences: string[] = [];
            for (let i = 0; i < 15; i++) {
                generatedSentences.push(markovChain.generateData(30));
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
            const originalChain = new SpaceEfficientWordMarkovChain();
            originalChain.initialize(testSentences);
            const chainFromExistingChain = new SpaceEfficientWordMarkovChain(makeRandom(), originalChain.chain);
            assert.deepEqual(originalChain.chain, chainFromExistingChain.chain);
        });
    });

    describe("PerformanceWordMarkovChain", () => {
        it("initialize() - correctly forms a markov chain", () => {
            const markovChain = new PerformanceWordMarkovChain();
            markovChain.initialize(testSentences);
            assert.strictEqual(markovChain.chain !== undefined, true);
            assert.deepEqual(
                wordArrayToWordCount(markovChain.chain[PerformanceWordMarkovChain.MARKOV_SENTENCE_BEGIN_KEY]),
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
                    [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.name), { is: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.is),
                {
                    sean: 1,
                    ozzie: 1,
                });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.sean),
                { [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.dog), { is: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.ozzie),
                { [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.there), { my: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.friend),
                { [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.what), { a: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.day),
                { [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1 });
            assert.deepEqual(wordArrayToWordCount(markovChain.chain.yaht),
                {
                    yaht: 2,
                    [PerformanceWordMarkovChain.MARKOV_SENTENCE_END_KEY]: 1,
                });
        });

        it("generateSentence() - creates sentence with expected words", () => {
            const markovChain = new PerformanceWordMarkovChain();
            markovChain.initialize(testSentences);
            const generatedSentences: string[] = [];
            for (let i = 0; i < 15; i++) {
                generatedSentences.push(markovChain.generateData(30));
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
            const originalChain = new PerformanceWordMarkovChain();
            originalChain.initialize(testSentences);
            const chainFromExistingChain = new PerformanceWordMarkovChain(makeRandom(), originalChain.chain);
            assert.deepEqual(originalChain.chain, chainFromExistingChain.chain);
        });
    });
});
