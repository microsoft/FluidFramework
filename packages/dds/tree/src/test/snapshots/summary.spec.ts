/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidClientVersion } from "../../codec/index.js";
import { TreeCompressionStrategy } from "../../feature-libraries/index.js";
import type { SharedTreeOptions } from "../../shared-tree/index.js";

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
		for (const versionKey of Object.keys(FluidClientVersion)) {
			describe(`Using TreeCompressionStrategy.${treeEncodeKey} and FluidClientVersion.${versionKey}`, () => {
				useSnapshotDirectory(`summary/${treeEncodeKey}/${versionKey}`);
				const options: SharedTreeOptions = {
					treeEncodeType,
					minVersionForCollab:
						FluidClientVersion[versionKey as keyof typeof FluidClientVersion],
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
