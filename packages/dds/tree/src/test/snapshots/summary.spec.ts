/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeSummarySnapshot } from "./utils";
import { generateTestTrees } from "./testTrees";
import { useSnapshotDirectory } from "./snapshotTools";

describe("snapshot tests", () => {
	useSnapshotDirectory();

	const testTrees = generateTestTrees();

	for (const { name: testName, runScenario, skip = false, only = false } of testTrees) {
		const itFn = only ? it.only : skip ? it.skip : it;

		itFn(testName, async () => {
			return runScenario(async (tree, innerName) => {
				const { summary } = await tree.summarize(true);
				takeSummarySnapshot(summary, `-${innerName}`);
			});
		});
	}
});
