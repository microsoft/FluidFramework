/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncGenerator, takeAsync as take, IRandom } from "@fluid-internal/stochastic-test-utils";
import { FuzzTestState, Operation } from "./fuzzEditGenerators";

export function runFuzzBatch(
	opGenerator: () => AsyncGenerator<Operation, FuzzTestState>,
	fuzzActions: (
		generatorFactory: AsyncGenerator<Operation, FuzzTestState>,
		seed: number,
	) => Promise<FuzzTestState>,
	opsPerRun: number,
	runsPerBatch: number,
	random: IRandom,
): void {
	const seed = random.integer(1, 1000000);
	for (let i = 0; i < runsPerBatch; i++) {
		const runSeed = seed + i;
		const generatorFactory = () => take(opsPerRun, opGenerator());
		it(`with seed ${runSeed}`, async () => {
			await fuzzActions(generatorFactory(), runSeed);
		}).timeout(20000);
	}
}
