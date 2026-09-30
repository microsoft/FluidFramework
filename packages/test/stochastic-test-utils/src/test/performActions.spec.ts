/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { asyncGeneratorFromArray, takeAsync } from "../generators.js";
import { FuzzTestMinimizer } from "../minification.js";
import { performFuzzActionsAsync } from "../performActions.js";
import { makeRandom } from "../random.js";
import type { BaseFuzzTestState, SaveInfo } from "../types.js";

interface Operation {
	type: "initialize" | "sample";
	value?: number;
	seed?: number;
}

describe("Recorded fuzz initialization", () => {
	let directory: string;
	let path: string;
	let saveInfo: SaveInfo;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "fuzz-initialization-"));
		path = join(directory, "operations.json");
		saveInfo = {
			saveOnSuccess: { path },
			saveOnFailure: { path },
			saveFluidOps: false,
		};
	});

	afterEach(() => {
		rmSync(directory, { recursive: true });
	});

	function readOperations(): Operation[] {
		return JSON.parse(readFileSync(path, "utf8")) as Operation[];
	}

	for (const forceGlobalSeed of [false, true]) {
		it(`does not change workload randomness with global seed ${forceGlobalSeed}`, async () => {
			const makeState = (): BaseFuzzTestState => {
				const random = makeRandom(42);
				random.integer(0, 100);
				return { random };
			};
			const generate = async (state: BaseFuzzTestState): Promise<Operation> => ({
				type: "sample",
				value: state.random.integer(0, 100),
			});
			const reduce = async (state: BaseFuzzTestState): Promise<void> => {
				state.random.integer(0, 100);
			};
			await performFuzzActionsAsync(
				takeAsync(3, generate),
				reduce,
				makeState(),
				saveInfo,
				forceGlobalSeed,
			);
			const expected = readOperations();
			let initialized = false;
			await performFuzzActionsAsync<Operation, BaseFuzzTestState>(
				takeAsync(3, async (state) => {
					assert(initialized);
					return generate(state);
				}),
				reduce,
				async (recordOperation) => {
					recordOperation({ type: "initialize" });
					const state = makeState();
					initialized = true;
					return state;
				},
				saveInfo,
				forceGlobalSeed,
			);
			assert.deepEqual(readOperations(), [{ type: "initialize" }, ...expected]);
		});
	}

	it("records bootstrap operations before propagating initialization failures", async () => {
		const error = new Error("Initialization failed");
		await assert.rejects(
			performFuzzActionsAsync<Operation, BaseFuzzTestState>(
				async () => assert.fail("Workload must not start"),
				async () => assert.fail("Workload must not start"),
				async (recordOperation) => {
					recordOperation({ type: "initialize" });
					throw error;
				},
				saveInfo,
			),
			(actual: unknown) => actual === error,
		);
		assert.deepEqual(readOperations(), [{ type: "initialize" }]);
	});

	it("keeps initialization when minimizing a workload failure", async () => {
		const operations: Operation[] = [{ type: "initialize" }, { type: "sample" }];
		const minimizer = new FuzzTestMinimizer(
			undefined,
			operations,
			saveInfo,
			async (generator) => {
				await performFuzzActionsAsync(
					generator,
					async (_, operation) => {
						if (operation.type === "sample") {
							throw new Error("Sample failed");
						}
					},
					{ random: makeRandom(0) },
				);
			},
			0,
		);
		assert.deepEqual(await minimizer.minimize(), [{ type: "initialize" }, { type: "sample" }]);
	});

	it("still applies recorded workload seeds after bootstrap", async () => {
		const observed: number[] = [];
		await performFuzzActionsAsync<Operation, BaseFuzzTestState>(
			asyncGeneratorFromArray([{ type: "sample", seed: 17 }]),
			async (state) => {
				observed.push(state.random.integer(0, 100));
			},
			async (recordOperation) => {
				recordOperation({ type: "initialize" });
				return { random: makeRandom(42) };
			},
			saveInfo,
		);
		assert.deepEqual(observed, [makeRandom(17).integer(0, 100)]);
		assert.deepEqual(readOperations(), [{ type: "initialize" }, { type: "sample", seed: 17 }]);
	});
});
