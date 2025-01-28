/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeCompressionStrategy } from "../../feature-libraries/index.js";
import { SharedTreeFormatVersion, type SharedTreeOptions } from "../../shared-tree/index.js";

import { generateTestTrees } from "./snapshotTestScenarios.js";
import { useSnapshotDirectory } from "./snapshotTools.js";
import { takeSummarySnapshot } from "./utils.js";

describe("snapshot tests", () => {
	for (const treeEncodeType of [
		TreeCompressionStrategy.Compressed,
		TreeCompressionStrategy.Uncompressed,
	]) {
		// Friendly description of tree encoding type
		const treeEncodeKey = TreeCompressionStrategy[treeEncodeType];
		for (const formatVersionKey of Object.keys(SharedTreeFormatVersion)) {
			describe(`Using TreeCompressionStrategy.${treeEncodeKey} and SharedTreeFormatVersion.${formatVersionKey}`, () => {
				useSnapshotDirectory(`summary/${treeEncodeKey}/${formatVersionKey}`);
				const options: SharedTreeOptions = {
					treeEncodeType,
					formatVersion:
						SharedTreeFormatVersion[formatVersionKey as keyof typeof SharedTreeFormatVersion],
				};
				const testTrees = generateTestTrees(options);

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
	}
});
