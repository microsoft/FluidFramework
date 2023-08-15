/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { createSnapshot, verifyEqualPastSnapshot } from "./utils";
import { generateTestTrees } from "./testTrees";

const regenerateSnapshots = process.argv.includes("--snapshot");

const dirPathTail = "src/test/snapshots/files";
const dirPath = path.join(__dirname, `../../../${dirPathTail}`);

function getFilepath(name: string): string {
	return path.join(dirPath, `${name}.json`);
}

describe("Summary snapshot", () => {
	// Only run this test when you want to regenerate the snapshot.
	if (regenerateSnapshots) {
		describe.only("regenerate", () => {
			for (const { name, tree } of generateTestTrees()) {
				it(`for ${name}`, async () => {
					const { summary } = await tree().summarize(true);
					await createSnapshot(getFilepath(name), summary);
				});
			}
		});
	}

	describe("matches the historical snapshot", () => {
		for (const { name, tree } of generateTestTrees()) {
			it(`for ${name}`, async () => {
				const { summary } = await tree().summarize(true);
				await verifyEqualPastSnapshot(getFilepath(name), summary);
			});
		}
	});
});
