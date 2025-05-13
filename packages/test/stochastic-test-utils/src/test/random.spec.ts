/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { strict as assert } from "assert";

import { integer } from "../distributions/index.js";
import { makeRandom } from "../index.js";
import { makeUuid4 } from "../random.js";

import { Counter, chiSquaredCriticalValues, computeChiSquared, parseUuid } from "./utils.js";

// For stochastic tests, we use the following predetermined seeds.
const testSeeds: [number, number, number, number][] = [
	[0x00000000, 0x00000000, 0x00000000, 0x00000000],
	[0x55e98b47, 0x4a704f04, 0x197cb00d, 0xabb28df1],
	[0xbe37e056, 0xb92cbbf4, 0x4557aa84, 0x1edd97c5],
	[0xdb4f5f50, 0x732a1971, 0x3a265b24, 0x214a2ad0],
	[0x8385e75c, 0x95ba7359, 0x405f48ac, 0xd4cc5402],
];

describe("Random", () => {
	describe("makeRandom()", () => {
		// Sanity check that we've plumbed XSadd's overloaded ctor.
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
		const nextU53: number[] = [];

		const mockU53 = () => {
			const next = nextU53.pop();

			assert.notEqual(
				next,
				undefined,
				"Must push next value to 'nextU53' array before invoking mockU53.",
			);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return next!;
		};

		const generateInteger = (alpha: number, min: number, max: number) => {
			assert(0 <= alpha && alpha <= 1, `α must be in range [0..1], but got α=${alpha}.`);

			const actualMin = Math.min(min, max);
			const actualMax = Math.max(min, max);

			const range = actualMax - actualMin + 1;
			if (range > Number.MAX_SAFE_INTEGER) {
				nextU53.push(Math.floor(alpha * Number.MAX_SAFE_INTEGER));
			} else {
				const divisor = Math.floor(2 ** 53 / range);
				const limit = (range - 1) * divisor;

				nextU53.push(alpha * limit);
			}
			const result = integer(mockU53)(min, max);

			assert(
				!(result < actualMin || actualMax < result),
				`Integer must be in range [${actualMin}..${actualMax}], but got ${result}.]`,
			);

			return result;
		};

		function assert_chi2<T>(generator: () => T, weights: [T, number][], numSamples = 10000) {
			assert(weights.length > 0);

			const counts = new Counter<T>();

			for (let i = 0; i < numSamples; i++) {
				counts.increment(generator());
			}

			const chi2 = computeChiSquared(weights, counts);

			const criticalValue = chiSquaredCriticalValues[weights.length - 1];

			assert(
				chi2 <= criticalValue,
				`Chi^2 expected result <= ${criticalValue}, but got ${chi2}`,
			);
		}

		function assert_chi2_uniform<T>(generator: () => T, choices: T[]) {
			assert_chi2(
				generator,
				choices.map((choice) => [choice, 1 / choices.length]),
			);
		}

		function assert_chi2_uniform_range(
			generator: () => number,
			min: number,
			max: number,
			numSamples?: number,
		) {
			const range = max - min + 1;

			assert_chi2(
				generator,
				new Array(range).fill(0).map<[number, number]>((_, index) => [index + min, 1 / range]),
				numSamples,
			);
		}

		describe("bool", () => {
			for (const p of [0, -1]) {
				it(`of probability ${p} must be 'false'.`, () => {
					assert_chi2_uniform(
						/* generator: */ () => makeRandom().bool(p),
						/* choices: */ [false],
					);
				});
			}

			for (const p of [1, 2]) {
				it(`of probability ${p} must be 'true'.`, () => {
					assert_chi2_uniform(
						/* generator: */ () => makeRandom().bool(p),
						/* choices: */ [true],
					);
				});
			}

			it(`of default probability 1/2 must be true ~1/2rd of the time`, () => {
				for (const seeds of testSeeds) {
					const random = makeRandom(...seeds);
					assert_chi2_uniform(/* generator: */ random.bool, /* choices: */ [true, false]);
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
					);
				}
			});
		});

		describe("real", () => {
			it(`has default range of [0..1).`, () => {
				const random = makeRandom();

				for (let i = 0; i < 100; i++) {
					const sample = random.real();
					assert(0 <= sample && sample < 1, `Must be in range [0..1), but got ${sample}.`);
				}
			});
		});

		describe("integer", () => {
			const testLimits = (min: number, max: number) => {
				const trueMin = Math.min(min, max);
				it(`[${min}..${max}] @ α=0 -> ${trueMin}`, () => {
					const actual = generateInteger(/* alpha: */ 0, min, max);
					assert.equal(actual, trueMin);
				});

				const trueMax = Math.max(min, max);
				it(`[${min}..${max}] @ α=1 -> ${trueMax}`, () => {
					const actual = generateInteger(/* alpha: */ 1, min, max);
					assert.equal(actual, trueMax);
				});
			};

			describe("must produce limits", () => {
				for (const [min, max] of [
					[0, 0],
					[0, Number.MAX_SAFE_INTEGER - 1],
					[Number.MIN_SAFE_INTEGER - 1, 0],
					[0, Number.MAX_SAFE_INTEGER],
					[Number.MIN_SAFE_INTEGER, 0],
					[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
				]) {
					describe("bonudary cases", () => {
						testLimits(min, max);
					});
				}

				const random = makeRandom();

				// Test cases handled by the divide with rejection approach
				describe("with |max - min| < 2^53", () => {
					for (let i = 0; i < 10; i++) {
						const min = random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
						const len = random.integer(0, Number.MAX_SAFE_INTEGER);
						testLimits(min, min + len);
					}
				});

				// Test cases that fall back on affine combination
				describe("with |max - min| >= 2^53", () => {
					for (let i = 0; i < 10; i++) {
						const min = random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
						const len = random.integer(
							Number.MAX_SAFE_INTEGER + 1,
							Number.MAX_SAFE_INTEGER * 2,
						);
						testLimits(min, min + len);
					}
				});
			});

			for (const [min, max] of [
				[0, 1],
				[-1, 1],
			]) {
				it(`in range [${min}..${max}] must have uniform distribution.`, () => {
					for (const seeds of testSeeds) {
						const random = makeRandom(...seeds);

						assert_chi2_uniform_range(
							/* generator: */ () => random.integer(min, max),
							min,
							max,
						);
					}
				});
			}

			// Construct the worst case scenario where 'integer()' will reject ~50% of samples.
			it("encounters rejection case", () => {
				for (const seeds of testSeeds) {
					const random = makeRandom(...seeds);

					const min = 0;
					const max = 2 ** 52;

					assert_chi2_uniform_range(
						/* generator: */ () => random.integer(min, max) & 0xf,
						/* min: */ 0,
						/* max: */ 15,
					);
				}
			});

			describe("degenerate cases", () => {
				it("should disallow malformed range", () => {
					for (const [min, max] of [
						[1, 0],
						[1, -1],
					]) {
						assert.throws(() => {
							makeRandom().integer(min, max);
						});
					}
				});

				it("should disallow NaN", () => {
					for (const [min, max] of [
						[0, NaN],
						[NaN, 0],
					]) {
						assert.throws(() => {
							makeRandom().integer(min, max);
						});
					}
				});
			});
		});

		describe("uuid4", () => {
			const validate = (uuid: string) => {
				const bytes = parseUuid(uuid);

				const version = bytes[6] >>> 4;
				assert.equal(
					version,
					0b100,
					`UUID v4 must be version 4, but got '${version}' for bits [48..51].`,
				);

				const variant = bytes[8] >>> 6;
				assert.equal(
					variant,
					0b10,
					`UUID v4 must be variant 2, but got '${variant}' for bits [64..65].`,
				);

				const re = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89a-f][\da-f]{3}-[\da-f]{12}$/;
				assert(
					re.test(uuid),
					`UUID must be in the form 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', but got '${uuid}'.`,
				);
			};

			// Predetermined bit patterns to verify that UUIDs are correctly constructed from four uint32s.

			for (const { u32x4, expected } of [
				// Validate that the 2 predetermined on bits are correctly set.
				{
					u32x4: [0x00000000, 0x00000000, 0x00000000, 0x00000000],
					expected: "00000000-0000-4000-8000-000000000000",
				},

				// Validate that the 4 predetermined off bits are correctly cleared.
				{
					u32x4: [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
					expected: "ffffffff-ffff-4fff-bfff-ffffffffffff",
				},

				// Validate that the 6 discarded bits have no effect.
				{
					u32x4: [0x00000001, 0x00000001, 0x00000003, 0x00000003],
					expected: "00000000-0000-4000-8000-000000000000",
				},

				// Set each bit of each u32 individually and check that the expected bits are 1 in the UUID.
				{
					u32x4: [0x80000000, 0x80000000, 0x80000000, 0x80000000],
					expected: "80000001-0000-4000-a000-000020000000",
				},
				{
					u32x4: [0x40000000, 0x40000000, 0x40000000, 0x40000000],
					expected: "40000000-8000-4000-9000-000010000000",
				},
				{
					u32x4: [0x20000000, 0x20000000, 0x20000000, 0x20000000],
					expected: "20000000-4000-4000-8800-000008000000",
				},
				{
					u32x4: [0x10000000, 0x10000000, 0x10000000, 0x10000000],
					expected: "10000000-2000-4000-8400-000004000000",
				},
				{
					u32x4: [0x08000000, 0x08000000, 0x08000000, 0x08000000],
					expected: "08000000-1000-4000-8200-000002000000",
				},
				{
					u32x4: [0x04000000, 0x04000000, 0x04000000, 0x04000000],
					expected: "04000000-0800-4000-8100-000001000000",
				},
				{
					u32x4: [0x02000000, 0x02000000, 0x02000000, 0x02000000],
					expected: "02000000-0400-4000-8080-000000800000",
				},
				{
					u32x4: [0x01000000, 0x01000000, 0x01000000, 0x01000000],
					expected: "01000000-0200-4000-8040-000000400000",
				},
				{
					u32x4: [0x00800000, 0x00800000, 0x00800000, 0x00800000],
					expected: "00800000-0100-4000-8020-000000200000",
				},
				{
					u32x4: [0x00400000, 0x00400000, 0x00400000, 0x00400000],
					expected: "00400000-0080-4000-8010-000000100000",
				},
				{
					u32x4: [0x00200000, 0x00200000, 0x00200000, 0x00200000],
					expected: "00200000-0040-4000-8008-000000080000",
				},
				{
					u32x4: [0x00100000, 0x00100000, 0x00100000, 0x00100000],
					expected: "00100000-0020-4000-8004-000000040000",
				},
				{
					u32x4: [0x00080000, 0x00080000, 0x00080000, 0x00080000],
					expected: "00080000-0010-4000-8002-000000020000",
				},
				{
					u32x4: [0x00040000, 0x00040000, 0x00040000, 0x00040000],
					expected: "00040000-0008-4000-8001-000000010000",
				},
				{
					u32x4: [0x00020000, 0x00020000, 0x00020000, 0x00020000],
					expected: "00020000-0004-4000-8000-800000008000",
				},
				{
					u32x4: [0x00010000, 0x00010000, 0x00010000, 0x00010000],
					expected: "00010000-0002-4000-8000-400000004000",
				},
				{
					u32x4: [0x00008000, 0x00008000, 0x00008000, 0x00008000],
					expected: "00008000-0001-4000-8000-200000002000",
				},
				{
					u32x4: [0x00004000, 0x00004000, 0x00004000, 0x00004000],
					expected: "00004000-0000-4800-8000-100000001000",
				},
				{
					u32x4: [0x00002000, 0x00002000, 0x00002000, 0x00002000],
					expected: "00002000-0000-4400-8000-080000000800",
				},
				{
					u32x4: [0x00001000, 0x00001000, 0x00001000, 0x00001000],
					expected: "00001000-0000-4200-8000-040000000400",
				},
				{
					u32x4: [0x00000800, 0x00000800, 0x00000800, 0x00000800],
					expected: "00000800-0000-4100-8000-020000000200",
				},
				{
					u32x4: [0x00000400, 0x00000400, 0x00000400, 0x00000400],
					expected: "00000400-0000-4080-8000-010000000100",
				},
				{
					u32x4: [0x00000200, 0x00000200, 0x00000200, 0x00000200],
					expected: "00000200-0000-4040-8000-008000000080",
				},
				{
					u32x4: [0x00000100, 0x00000100, 0x00000100, 0x00000100],
					expected: "00000100-0000-4020-8000-004000000040",
				},
				{
					u32x4: [0x00000080, 0x00000080, 0x00000080, 0x00000080],
					expected: "00000080-0000-4010-8000-002000000020",
				},
				{
					u32x4: [0x00000040, 0x00000040, 0x00000040, 0x00000040],
					expected: "00000040-0000-4008-8000-001000000010",
				},
				{
					u32x4: [0x00000020, 0x00000020, 0x00000020, 0x00000020],
					expected: "00000020-0000-4004-8000-000800000008",
				},
				{
					u32x4: [0x00000010, 0x00000010, 0x00000010, 0x00000010],
					expected: "00000010-0000-4002-8000-000400000004",
				},
				{
					u32x4: [0x00000008, 0x00000008, 0x00000008, 0x00000008],
					expected: "00000008-0000-4001-8000-000200000002",
				},
				{
					u32x4: [0x00000004, 0x00000004, 0x00000004, 0x00000004],
					expected: "00000004-0000-4000-8000-000180000001",
				},
				{
					u32x4: [0x00000002, 0x00000002, 0x00000002, 0x00000002],
					expected: "00000002-0000-4000-8000-000040000000",
				},
			]) {
				it(`[${u32x4.map((u32) => u32.toString(16).padStart(8, "0"))}] -> ${expected}`, () => {
					const [a, b, c, d] = u32x4;
					const actual = makeUuid4(a, b, c, d);
					assert.equal(actual, expected);
					validate(actual);
				});
			}

			it("produces compliant variant 4 UUIDs", () => {
				const random = makeRandom();
				for (let i = 0; i < 100; i++) {
					validate(random.uuid4());
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
					);
				}
			});
		});

		describe("pick", () => {
			for (const choices of [[1], [1, 2], [1, 2, 3]]) {
				it(`of choices ${JSON.stringify(choices)} must have uniform distribution`, () => {
					for (const seeds of testSeeds) {
						const random = makeRandom(...seeds);
						assert_chi2_uniform(() => random.pick(choices), choices);
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

			for (const items of [[0], [0, 1], [0, 1, 2]]) {
				for (let pos = 0; pos < items.length; pos++) {
					it(`each item of ${JSON.stringify(
						items,
					)} may appears at each position ${pos}`, () => {
						for (const seeds of testSeeds) {
							const random = makeRandom(...seeds);

							assert_chi2_uniform(
								/* generator: */ () => {
									const array = [...items];
									random.shuffle(array);
									return array[pos];
								},
								/* choices: */ items,
							);
						}
					});
				}
			}
		});

		describe("normal", () => {
			describe("produces normal distribution", () => {
				it("with μ = 0, σ = 1 (default)", () => {
					const clamp = (min, value, max) => Math.min(Math.max(value, min), max);

					for (const seeds of testSeeds) {
						const random = makeRandom(...seeds);

						assert_chi2(
							/* generator: */ () => clamp(-3, Math.round(random.normal()), 3),
							/* weights: */ [
								[-3, 0.0062],
								[-2, 0.0606],
								[-1, 0.2417],
								[0, 0.3829],
								[1, 0.2417],
								[2, 0.0606],
								[3, 0.0062],
							],
						);
					}
				});

				it("with μ = -0.5, σ = 1.5", () => {
					const clamp = (min, value, max) => Math.min(Math.max(value, min), max);

					for (const seeds of testSeeds) {
						const random = makeRandom(...seeds);

						assert_chi2(
							/* generator: */ () => clamp(-5, Math.round(random.normal(-0.5, 1.5)), 4),
							/* weights: */ [
								[-5, 0.0038],
								[-4, 0.0189],
								[-3, 0.0685],
								[-2, 0.1613],
								[-1, 0.2475],
								[0, 0.2475],
								[1, 0.1613],
								[2, 0.0685],
								[3, 0.0189],
								[4, 0.0038],
							],
						);
					}
				});
			});
		});
	});
});
