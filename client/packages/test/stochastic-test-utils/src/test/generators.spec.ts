/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    asyncGeneratorFromArray,
    chain,
    chainAsync,
    createWeightedAsyncGenerator,
    createWeightedGenerator,
    generatorFromArray,
    interleave,
    interleaveAsync,
    repeat,
    repeatAsync,
    take,
    takeAsync,
} from "../generators";
import { makeRandom } from "../random";
import { AsyncGenerator, Generator, IRandom, done } from "../types";
import { chiSquaredCriticalValues, computeChiSquared, Counter } from "./utils";

function assertGeneratorProduces<T>(generator: Generator<T, void>, results: T[]): void {
    const actual: T[] = [];
    let result = generator();
    while (result !== done) {
        actual.push(result);
        result = generator();
    }
    assert.deepEqual(actual, results);
}

async function assertAsyncGeneratorProduces<T>(generator: AsyncGenerator<T, void>, results: T[]): Promise<void> {
    const actual: T[] = [];
    let result = await generator();
    while (result !== done) {
        actual.push(result);
        result = await generator();
    }
    assert.deepEqual(actual, results);
}

describe("generators", () => {
    describe("take", () => {
        it("with 0 elements", () => {
            assertGeneratorProduces(take(0, () => 42), []);
        });

        it("with more than 0 elements", () => {
            assertGeneratorProduces(take(2, () => 42), [42, 42]);
        });

        it("with a generator that terminates before its count is up", () => {
            assertGeneratorProduces(take(3, take(2, () => 5)), [5, 5]);
        });
    });

    describe("takeAsync", () => {
        it("with 0 elements", async () => {
            await assertAsyncGeneratorProduces(takeAsync(0, async () => 42), []);
        });

        it("with more than 0 elements", async () => {
            await assertAsyncGeneratorProduces(takeAsync(2, async () => 42), [42, 42]);
        });

        it("with a generator that terminates before its count is up", async () => {
            await assertAsyncGeneratorProduces(takeAsync(3, takeAsync(2, async () => 5)), [5, 5]);
        });
    });

    describe("repeat", () => {
        it("produces the input value repeatedly", () => {
            const generator = repeat("testValue");
            for (let i = 0; i < 10; i++) {
                assert.equal(generator(), "testValue");
            }
        });
    });

    describe("repeatAsync", () => {
        it("produces the input value repeatedly", async () => {
            const generator = repeatAsync("testValue");
            for (let i = 0; i < 10; i++) {
                assert.equal(await generator(), "testValue");
            }
        });
    });

    const fromArrayCases = [
        { title: "works on an empty array", value: [] },
        { title: "works on an array with content", value: [1, 1] },
        { title: "works on an array with heterogeneous content", value: [1, "a", 2, "b"] },
    ];

    describe("generatorFromArray", () => {
        for (const { title, value } of fromArrayCases) {
            it(title, () => {
                assertGeneratorProduces(generatorFromArray(value), value);
            });
        }
    });

    describe("asyncGeneratorFromArray", () => {
        for (const { title, value } of fromArrayCases) {
            it(title, async () => {
                await assertAsyncGeneratorProduces(asyncGeneratorFromArray(value), value);
            });
        }
    });

    describe("chain", () => {
        it("produces an empty generator with no arguments", () => {
            assertGeneratorProduces(chain(), []);
        });

        it("chains input generators together", () => {
            assertGeneratorProduces(
                chain<number | string, void>(take(2, () => 1), take(3, () => "a")),
                [1, 1, "a", "a", "a"],
            );
        });
    });

    describe("chainAsync", () => {
        it("produces an empty generator with no arguments", async () => {
            await assertAsyncGeneratorProduces(chainAsync(), []);
        });

        it("chains input generators together", async () => {
            await assertAsyncGeneratorProduces(
                chainAsync<number | string, void>(takeAsync(2, async () => 1), takeAsync(3, async () => "a")),
                [1, 1, "a", "a", "a"],
            );
        });
    });

    describe("interleave", () => {
        const alphabetGeneratorFactory = () => generatorFromArray(["a", "b", "c", "d"]);
        const numberGeneratorFactory = () => generatorFromArray([1, 2, 3, 4]);

        it("alternates input generators", () => {
            assertGeneratorProduces(
                interleave<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory()),
                ["a", 1, "b", 2, "c", 3, "d", 4],
            );
        });

        it("can consume more than one op at a time from generator1", () => {
            assertGeneratorProduces(
                take(6, interleave<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 2)),
                ["a", "b", 1, "c", "d", 2],
            );
        });

        it("can consume more than one op at a time from generator2", () => {
            assertGeneratorProduces(
                take(6, interleave<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 1, 2)),
                ["a", 1, 2, "b", 3, 4],
            );
        });

        it("can consume more than one op at a time from both generator1 and generator2", () => {
            assertGeneratorProduces(
                interleave<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 2, 2),
                ["a", "b", 1, 2, "c", "d", 3, 4],
            );
        });

        it("exhausts both generators before halting given mismatched lengths", () => {
            assertGeneratorProduces(
                interleave<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 3),
                ["a", "b", "c", 1, "d", 2, 3, 4],
            );
        });
    });

    describe("interleaveAsync", () => {
        const alphabetGeneratorFactory = () => asyncGeneratorFromArray(["a", "b", "c", "d"]);
        const numberGeneratorFactory = () => asyncGeneratorFromArray([1, 2, 3, 4]);

        it("alternates input generators", async () => {
            await assertAsyncGeneratorProduces(
                interleaveAsync<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory()),
                ["a", 1, "b", 2, "c", 3, "d", 4],
            );
        });

        it("can consume more than one op at a time from generator1", async () => {
            await assertAsyncGeneratorProduces(
                takeAsync(6,
                    interleaveAsync<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 2),
                ),
                ["a", "b", 1, "c", "d", 2],
            );
        });

        it("can consume more than one op at a time from generator2", async () => {
            await assertAsyncGeneratorProduces(
                takeAsync(6,
                    interleaveAsync<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 1, 2),
                ),
                ["a", 1, 2, "b", 3, 4],
            );
        });

        it("can consume more than one op at a time from both generator1 and generator2", async () => {
            await assertAsyncGeneratorProduces(
                interleaveAsync<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 2, 2),
                ["a", "b", 1, 2, "c", "d", 3, 4],
            );
        });

        it("exhausts both generators before halting given mismatched lengths", async () => {
            await assertAsyncGeneratorProduces(
                interleaveAsync<number | string, void>(alphabetGeneratorFactory(), numberGeneratorFactory(), 3),
                ["a", "b", "c", 1, "d", 2, 3, 4],
            );
        });
    });

    const weightsCases: [string, number][][] = [
        [
            ["a", 1],
            ["b", 1],
        ],
        [
            ["a", 1],
            ["b", 2],
        ],
        [
            ["a", 1],
            ["b", 2],
            ["c", 3],
        ],
        [
            ["a", 1],
            ["b", 2],
            ["c", 1],
            ["d", 1],
        ],
    ];

    // The distribution produced by createWeightedGenerator is a multinomial distribution. See:
    // https://en.wikipedia.org/wiki/Multinomial_distribution

    describe("createWeightedGenerator", () => {
        let random: IRandom;
        beforeEach(() => {
            random = makeRandom(0);
        });

        for (const weights of weightsCases) {
            it(`converges to the expected distribution with weights: ${weights}`, () => {
                const generator = createWeightedGenerator(weights);
                const sampleCounts = new Counter<string>();

                const numberOfSamples = 10000;
                for (let i = 0; i < numberOfSamples; i++) {
                    const sample = generator({ random });
                    assert(sample !== done);
                    sampleCounts.increment(sample);
                }

                const chiSquared = computeChiSquared(weights, sampleCounts);
                const degreesOfFreedom = weights.length - 1;
                const criticalValue = chiSquaredCriticalValues[degreesOfFreedom];
                assert(criticalValue !== undefined);
                assert(chiSquared < criticalValue,
                    `Expected 'chiSquared' to be less than ${criticalValue}, but got ${chiSquared}.`);
            });
        }

        it("only generates values with accepanceCondition evaluating to true", () => {
            const generator = createWeightedGenerator(
                [
                    ["a", 1],
                    ["b", 1],
                    ["c", 2, () => false],
                ],
            );
            for (let i = 0; i < 100; i++) {
                const result = generator({ random });
                assert(result === "a" || result === "b");
            }
        });

        it("accepts generator sub-arguments", () => {
            const generator = createWeightedGenerator(
                [
                    [interleave(() => "a", () => "b"), 1],
                    ["c", 1],
                ],
            );
            let expectedNext = "a";
            for (let i = 0; i < 100; i++) {
                const result = generator({ random });
                assert(result === "c" || result === expectedNext);
                if (result === expectedNext) {
                    expectedNext = expectedNext === "a" ? "b" : "a";
                }
            }
        });
    });

    describe("createWeightedAsyncGenerator", () => {
        let random: IRandom;
        beforeEach(() => {
            random = makeRandom(0);
        });

        for (const weights of weightsCases) {
            it(`converges to the expected distribution with weights: ${weights}`, async () => {
                const generator = createWeightedAsyncGenerator(weights);
                const sampleCounts = new Counter<string>();

                const numberOfSamples = 10000;
                for (let i = 0; i < numberOfSamples; i++) {
                    const sample = await generator({ random });
                    assert(sample !== done);
                    sampleCounts.increment(sample);
                }

                const chiSquared = computeChiSquared(weights, sampleCounts);
                const degreesOfFreedom = weights.length - 1;
                const criticalValue = chiSquaredCriticalValues[degreesOfFreedom];
                assert(criticalValue !== undefined);
                assert(chiSquared < criticalValue,
                    `Expected 'chiSquared' to be less than ${criticalValue}, but got ${chiSquared}.`);
            });
        }

        it("only generates values with accepanceCondition evaluating to true", async () => {
            const generator = createWeightedAsyncGenerator(
                [
                    ["a", 1],
                    ["b", 1],
                    ["c", 2, () => false],
                ],
            );
            for (let i = 0; i < 100; i++) {
                const result = await generator({ random });
                assert(result === "a" || result === "b");
            }
        });

        it("accepts generator sub-arguments", async () => {
            const generator = createWeightedAsyncGenerator(
                [
                    [interleaveAsync(async () => "a", async () => "b"), 1],
                    ["c", 1],
                ],
            );
            let expectedNext = "a";
            for (let i = 0; i < 100; i++) {
                const result = await generator({ random });
                assert(result === "c" || result === expectedNext);
                if (result === expectedNext) {
                    expectedNext = expectedNext === "a" ? "b" : "a";
                }
            }
        });
    });
});
