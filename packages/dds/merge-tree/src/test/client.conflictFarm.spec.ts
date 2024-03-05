/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeFuzz, makeRandom } from "@fluid-private/stochastic-test-utils";
import {
	annotateRange,
	doOverRange,
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	insertAtRefPos,
	removeRange,
	runMergeTreeOperationRunner,
	TestOperation,
	generateClientNames,
} from "./mergeTreeOperationRunner.js";
import { TestClient } from "./testClient.js";

interface IConflictFarmConfig extends IMergeTreeOperationRunnerConfig {
	minLength: IConfigRange;
	clients: IConfigRange;
}

const allOperations: TestOperation[] = [removeRange, annotateRange, insertAtRefPos];

export const debugOptions: IConflictFarmConfig = {
	minLength: { min: 1, max: 1 },
	clients: { min: 3, max: 3 },
	opsPerRoundRange: { min: 1, max: 100 },
	rounds: 1000,
	operations: allOperations,
	incrementalLog: true,
	growthFunc: (input: number) => input + 1,
};

export const defaultOptions: IConflictFarmConfig = {
	minLength: { min: 1, max: 512 },
	clients: { min: 1, max: 8 },
	opsPerRoundRange: { min: 1, max: 128 },
	rounds: 8,
	operations: allOperations,
	growthFunc: (input: number) => input * 2,
};

export const longOptions: IConflictFarmConfig = {
	minLength: { min: 1, max: 512 },
	clients: { min: 1, max: 32 },
	opsPerRoundRange: { min: 1, max: 512 },
	rounds: 32,
	operations: allOperations,
	growthFunc: (input: number) => input * 2,
};

export const stressOptions: IConflictFarmConfig = {
	minLength: { min: 1, max: 512 },
	clients: { min: 1, max: 32 },
	opsPerRoundRange: { min: 1, max: 128 },
	rounds: 32,
	operations: allOperations,
	growthFunc: (input: number) => input * 2,
};

// Generate a list of single character client names, support up to 69 clients
const clientNames = generateClientNames();

function runConflictFarmTests(opts: IConflictFarmConfig, extraSeed?: number): void {
	doOverRange(opts.minLength, opts.growthFunc, (minLength) => {
		it(`ConflictFarm_${minLength}`, async () => {
			const random = makeRandom(0xdeadbeef, 0xfeedbed, minLength, extraSeed ?? 0);
			const testOpts = { ...opts };
			if (extraSeed) {
				testOpts.resultsFilePostfix ??= "";
				testOpts.resultsFilePostfix += extraSeed;
			}

			const clients: TestClient[] = [new TestClient()];
			clients.forEach((c, i) => c.startOrUpdateCollaboration(clientNames[i]));

			let seq = 0;
			while (clients.length < opts.clients.max) {
				clients.forEach((c) => c.updateMinSeq(seq));

				// Add double the number of clients each iteration
				const targetClients = Math.max(opts.clients.min, opts.growthFunc(clients.length));
				for (let cc = clients.length; cc < targetClients; cc++) {
					const newClient = await TestClient.createFromClientSnapshot(
						clients[0],
						clientNames[cc],
					);
					clients.push(newClient);
				}

				seq = runMergeTreeOperationRunner(random, seq, clients, minLength, opts);
			}
		}).timeout(30 * 10000);
	});
}

describeFuzz("MergeTree.Client", ({ testCount, isStress }) => {
	const opts = isStress ? stressOptions : defaultOptions;
	// defaultOptions;
	// debugOptions;
	// longOptions;

	if (testCount > 1) {
		doOverRange(
			{ min: 0, max: testCount - 1 },
			(x) => x + 1,
			(seed) => {
				describe(`with seed ${seed}`, () => {
					runConflictFarmTests(opts, seed);
				});
			},
		);
	} else {
		runConflictFarmTests(opts);
	}
});
