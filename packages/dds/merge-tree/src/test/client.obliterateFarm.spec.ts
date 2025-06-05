/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createFuzzDescribe, makeRandom } from "@fluid-private/stochastic-test-utils";

import {
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	TestOperation,
	doOverRange,
	generateClientNames,
	runMergeTreeOperationRunner,
} from "./mergeTreeOperationRunner.js";
import {
	annotateWithField,
	generateInsertWithField,
	insertAvoidField,
	insertField,
	obliterateField,
	obliterateFieldZeroLength,
	// removeWithField,
} from "./obliterateOperations.js";
import { TestClient } from "./testClient.js";

interface IObliterateFarmConfig extends IMergeTreeOperationRunnerConfig {
	minLength: IConfigRange;
	clients: IConfigRange;
}

const allOperations: TestOperation[] = [
	// The test model is not currently stable enough to support removeWithField: logic to look for fields
	// relies on text inside fields being numeric and text outside of fields alphabetic, but if a removal
	// operation takes away a whole field, a concurrent field replace (obliterate + insert new field content)
	// can result in numeric characters outside of fields.
	// removeWithField,
	annotateWithField,
	insertAvoidField,
	insertField,
	obliterateField,
];

// Note: this test isn't totally stable for all options matrices. E.g. there appear to be some issues with
// adding clients mid-run, which is likely related to known issues with obliterate and summarization.
export const defaultOptions: IObliterateFarmConfig = {
	minLength: { min: 1, max: 512 },
	clients: { min: 3, max: 3 },
	opsPerRoundRange: { min: 1, max: 128 },
	rounds: 8,
	operations: allOperations,
	growthFunc: (input: number) => input * 2,
	insertText: generateInsertWithField,
};

// Generate a list of single character client names, support up to 69 clients
const clientNames = generateClientNames();

function runObliterateFarmTests(opts: IObliterateFarmConfig, extraSeed?: number): void {
	doOverRange(opts.minLength, opts.growthFunc, (minLength) => {
		for (const { name, config } of [
			{
				name: "obliterate with exact range replacement",
				config: {
					...opts,
					// TODO: ensure that obliterate and inserts are not separated before enabling this
					// applyOpDuringGeneration: true,
				},
			},
			{
				name: "obliterate exact range allowing zero length",
				config: {
					...opts,
					operations: [
						annotateWithField,
						insertAvoidField,
						insertField,
						obliterateFieldZeroLength,
					],
				},
			},
		])
			it(`${name}: ObliterateFarm_${minLength}`, async () => {
				const random = makeRandom(0xdeadbeef, 0xfeedbed, minLength, extraSeed ?? 0);

				const clients: TestClient[] = [
					new TestClient({
						mergeTreeEnableObliterate: true,
						mergeTreeEnableSidedObliterate: true,
						mergeTreeEnableAnnotateAdjust: true,
					}),
				];
				for (const [i, c] of clients.entries()) c.startOrUpdateCollaboration(clientNames[i]);

				let seq = 0;
				while (clients.length < config.clients.max) {
					for (const c of clients) c.updateMinSeq(seq);

					// Add double the number of clients each iteration
					const targetClients = Math.max(
						config.clients.min,
						config.growthFunc(clients.length),
					);
					for (let cc = clients.length; cc < targetClients; cc++) {
						const newClient = await TestClient.createFromClientSnapshot(
							clients[0],
							clientNames[cc],
						);
						clients.push(newClient);
					}

					seq = runMergeTreeOperationRunner(random, seq, clients, minLength, config);
				}
			}).timeout(30 * 10000);
	});
}

// More tests pass, but due to how this farm selects ops, the tests take a while to run, and merge-tree
// already a test suite on the longer side.
const describeFuzz = createFuzzDescribe({ defaultTestCount: 1 });
describeFuzz("MergeTree.Client Obliterate", ({ testCount }) => {
	if (testCount > 1) {
		doOverRange(
			{ min: 0, max: testCount - 1 },
			(x) => x + 1,
			(seed) => {
				describe(`with seed ${seed}`, () => {
					runObliterateFarmTests(defaultOptions, seed);
				});
			},
		);
	} else {
		runObliterateFarmTests(defaultOptions);
	}
});
