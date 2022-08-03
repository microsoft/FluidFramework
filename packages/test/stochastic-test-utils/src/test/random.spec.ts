/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { strict as assert } from "assert";
import { makeRandom } from "..";
import { makeUuid4 } from "../random";
import { computeChiSquared, Counter, parseUuid } from "./utils";

const testSeeds: [number, number, number, number][] = [
    [0x00000000, 0x00000000, 0x00000000, 0x00000000],
    [0x55e98b47, 0x4a704f04, 0x197cb00d, 0xabb28df1],
    [0xbe37e056, 0xb92cbbf4, 0x4557aa84, 0x1edd97c5],
    [0xdb4f5f50, 0x732a1971, 0x3a265b24, 0x214a2ad0],
    [0x8385e75c, 0x95ba7359, 0x405f48ac, 0xd4cc5402],
];

describe("Random", () => {
    describe("makeRandom()", () => {
        it("Seed is randomly initialized if not specified", () => {
            assert.notEqual(makeRandom().real(0, 1), makeRandom().real(0, 1));
        });

        it("Unspecified seed numbers default to zero", () => {
            const same = [
                makeRandom(0),
                makeRandom(0, 0),
                makeRandom(0, 0, 0),
                makeRandom(0, 0, 0, 0),
            ].map((src) => src.real(0, 1));

            for (let i = 1; i < same.length; i++) {
                assert.equal(same[0], same[i]);
            }
        });
    });

    describe("distribution", () => {
        /**
         * Invokes the generator
         */
        function assert_chi2<T>(generator: () => T, weights: [T, number][], criticalValue: number, numSamples = 10000) {
            assert(weights.length > 0);

            const counts = new Counter<T>();

            for (let i = 0; i < numSamples; i++) {
                counts.increment(generator());
            }

            const chi2 = computeChiSquared(weights, counts);

            assert(chi2 <= criticalValue,
                `Chi^2 expected result <= ${criticalValue}, but got ${chi2}`);
        }

        function assert_chi2_uniform<T>(
            generator: () => T,
            choices: T[],
            criticalValue: number,
            numSamples = 10000,
        ) {
            assert_chi2(
                generator,
                choices.map((choice) => [choice, 1 / choices.length]),
                criticalValue,
                numSamples);
        }

        function assert_chi2_uniform_range(
            generator: () => number,
            min: number,
            max: number,
            criticalValue: number,
            numSamples = 10000,
        ) {
            const range = max - min + 1;

            assert_chi2(
                generator,
                new Array(range)
                    .fill(0)
                    .map<[number, number]>((_, index) => [index + min, 1 / range]),
                criticalValue,
                numSamples);
        }

        describe("bool", () => {
            for (const p of [0, -1]) {
                it(`of probability ${p} must be 'false'.`, () => {
                    assert_chi2_uniform(
                        /* generator: */ () => makeRandom().bool(p),
                        /* choices: */ [false],
                        /* critical: */ 0,
                    );
                });
            }

            for (const p of [1, 2]) {
                it(`of probability ${p} must be 'true'.`, () => {
                    assert_chi2_uniform(
                        /* generator: */ () => makeRandom().bool(p),
                        /* choices: */ [true],
                        /* critical: */ 0,
                    );
                });
            }

            it(`of default probability 1/2 must be true ~1/2rd of the time`, () => {
                for (const seeds of testSeeds) {
                    const random = makeRandom(...seeds);
                    assert_chi2_uniform(
                        /* generator: */ random.bool,
                        /* choices: */ [true, false],
                        /* critical: */ 4.39,
                    );
                }
            });

            it(`of probability 1/3 must be true ~1/3rd of the time`, () => {
                for (const seeds of testSeeds) {
                    const random = makeRandom(...seeds);
                    assert_chi2(
                        /* generator: */ () => random.bool(1 / 3),
                        /* weights: */ [
                            [true, 1 / 3],
                            [false, 2 / 3],
                        ],
                        /* critical: */ 4.33);
                }
            });
        });

        describe("integer", () => {
            for (const [min, max] of [
                [0, 0],
                [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
                [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
            ]) {
                it(`in range [${min}..${max}] must be ${min}.`, () => {
                    assert.equal(makeRandom().integer(min, max), min);
                });
            }

            for (const [min, max, critical] of [
                [0, 1, 4.39],
                [-1, 1, 3.38],
            ]) {
                it(`in range [${min}..${max}] must have uniform distribution.`, () => {
                    for (const seeds of testSeeds) {
                        const random = makeRandom(...seeds);

                        assert_chi2_uniform_range(
                            /* generator: */ () => random.integer(min, max),
                            min,
                            max,
                            critical,
                        );
                    }
                });
            }
        });

        describe("uuid4", () => {
            /* eslint-disable max-len */
            for (const { u32x4, expected } of [
                { u32x4: [0x00000000, 0x00000000, 0x00000000, 0x00000000], expected: "00000000-0000-4000-8000-000000000000" },
                { u32x4: [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], expected: "ffffffff-ffff-4fff-bfff-ffffffffffff" },
                { u32x4: [0x00000000, 0x00000007, 0x00000003, 0x00000000], expected: "00000000-0000-4000-8000-000000000000" },
                { u32x4: [0x12345678, 0x00000000, 0x00000000, 0x00000000], expected: "12345678-0000-4000-8000-000000000000" },
                { u32x4: [0x00000000, 0x12345678, 0x00000000, 0x00000000], expected: "00000000-1234-4567-8000-000000000000" },
                { u32x4: [0x00000000, 0x00000000, 0x12345678, 0x00000000], expected: "00000000-0000-4000-848d-159e00000000" },
                { u32x4: [0x00000000, 0x00000000, 0x00000000, 0x12345678], expected: "00000000-0000-4000-8000-000012345678" },
                { u32x4: [0x0f1e2d3c, 0x4b5a6978, 0x8796a5b4, 0xc3d2e1f0], expected: "0f1e2d3c-4b5a-4697-a1e5-a96dc3d2e1f0" },
            ]) {
            /* eslint-enable max-len */
                it(`[${u32x4.map((u32) => u32.toString(16).padStart(8, "0"))}] -> ${expected}`, () => {
                    const [a, b, c, d] = u32x4;
                    const actual = makeUuid4(a, b, c, d);
                    assert.equal(actual, expected);
                });
            }

            it("produces compliant variant 4 UUIDs", () => {
                for (const seeds of testSeeds) {
                    const random = makeRandom(...seeds);
                    const uuid = random.uuid4();
                    const bytes = parseUuid(uuid);

                    const version = bytes[6] >>> 4;
                    assert.equal(version, 0b100,
                        `UUID v4 must be version 4, but got '${version}' for bits [48..51].`);

                    const variant = bytes[8] >>> 6;
                    assert.equal(variant, 0b10,
                        `UUID v4 must be variant 2, but got '${variant}' for bits [64..65].`);

                    // eslint-disable-next-line unicorn/no-unsafe-regex
                    const re = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;
                    assert(re.test(uuid),
                        `UUID must be in the form 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', but got '${uuid}'.`);
                }
            });
        });

        describe("string", () => {
            const base58 = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

            it("defaults to base58 alphabet", () => {
                for (const seeds of testSeeds) {
                    const random = makeRandom(...seeds);
                    assert_chi2_uniform(
                        /* generator: */ () => random.string(1),
                        /* choices: */ base58.split(""),
                        /* critical: */ 59.48);
                }
            });
        });

        describe("pick", () => {
            for (const { choices, critical } of [
                { choices: [1], critical: 0 },
                { choices: [1, 2], critical: 4.39 },
                { choices: [1, 2, 3], critical: 3.38 },
            ]) {
                it(`of choices ${JSON.stringify(choices)} must have uniform distribution`, () => {
                    for (const seeds of testSeeds) {
                        const random = makeRandom(...seeds);
                        assert_chi2_uniform(() => random.pick(choices), choices, critical);
                    }
                });
            }
        });

        describe("shuffle", () => {
            it("accepts empty array", () => {
                // Paranoid check that 'shuffle()' accepts and does not modify an empty array.
                const items = [];
                makeRandom().shuffle(items);
                assert.deepEqual(items, []);
            });

            for (const { items, critical } of [
                { items: [0], critical: 0 },
                { items: [0, 1], critical: 10.04 },
                { items: [0, 1, 2], critical: 7.06 },
            ]) {
                for (let i = 0; i < items.length; i++) {
                    it(`each item of ${JSON.stringify(items)} may appears at each position ${i}`, () => {
                        for (const seeds of testSeeds) {
                            const random = makeRandom(...seeds);

                            assert_chi2_uniform(
                                /* generator: */ () => {
                                    random.shuffle(items);
                                    return items[0];
                                },
                                /* choices: */ items,
                                critical);
                        }
                    });
                }
            }
        });
    });
});
