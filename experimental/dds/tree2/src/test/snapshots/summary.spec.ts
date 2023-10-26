/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { useAsyncDeterministicStableId } from "../../util";
import { createSnapshot, regenTestDirectory, verifyEqualPastSnapshot } from "./utils";
import { generateTestTrees } from "./testTrees";

const regenerateSnapshots = process.argv.includes("--snapshot");

const dirPathTail = "src/test/snapshots/files";
const dirPath = path.join(__dirname, `../../../${dirPathTail}`);

function getFilepath(name: string): string {
	return path.join(dirPath, `${name}.json`);
}

const trees: {
	name: string;
	summary: ISummaryTree;
}[] = [];

const testNames = new Set<string>();

describe("snapshot tests", () => {
	if (regenerateSnapshots) {
		regenTestDirectory(dirPath);
	}

	const testTrees = generateTestTrees();

	for (const { name: testName, runScenario, skip = false, only = false } of testTrees) {
		const itFn = only ? it.only : skip ? it.skip : it;

		itFn(`${regenerateSnapshots ? "regenerate " : ""}for ${testName}`, async () => {
			await useAsyncDeterministicStableId(async () => {
				return runScenario(async (tree, innerName) => {
					const fullName = `${testName}-${innerName}`;

					if (testNames.has(fullName)) {
						throw new Error(`Duplicate snapshot name: ${fullName}`);
					}

					testNames.add(fullName);

					const { summary } = await tree.summarize(true);
					// eslint-disable-next-line unicorn/prefer-ternary
					if (regenerateSnapshots) {
						await createSnapshot(getFilepath(fullName), summary);
					} else {
						await verifyEqualPastSnapshot(getFilepath(fullName), summary, fullName);
					}
				});
			});
		});
	}
});
