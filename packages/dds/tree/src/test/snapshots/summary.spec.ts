/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeSummarySnapshot } from "./utils.js";
import { generateTestTrees } from "./testTrees.js";
import { useSnapshotDirectory } from "./snapshotTools.js";

describe("snapshot tests", () => {
	useSnapshotDirectory();
	for (const useUncompressedEncode of [false, true]) {
		const compressionType = useUncompressedEncode ? "uncompressed" : "default compression";
		describe(`${compressionType}`, () => {
			const testTrees = generateTestTrees(useUncompressedEncode);

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
	}
});
