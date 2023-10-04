/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { createSnapshot, regenTestDirectory, verifyEqualPastSnapshot } from "./utils";
import { generateTestTrees } from "./testTrees";

const regenerateSnapshots = process.argv.includes("--snapshot");

const dirPathTail = "src/test/snapshots/files";
const dirPath = path.join(__dirname, `../../../${dirPathTail}`);

function getFilepath(name: string): string {
	return path.join(dirPath, `${name}.json`);
}

// TODO: The generated test trees should eventually be updated to use the chunked-forest.
generateTestTrees()
	.then((trees) => {
		describe("Summary snapshot", () => {
			// Only run this test when you want to regenerate the snapshot.
			if (regenerateSnapshots) {
				regenTestDirectory(dirPath);
				describe.only("regenerate", () => {
					for (const { name, summary } of trees) {
						it(`for ${name}`, async () => {
							await createSnapshot(getFilepath(name), summary);
						});
					}
				});
			}

			describe("matches the historical snapshot", () => {
				for (const { name, summary } of trees) {
					it(`for ${name}`, async () => {
						await verifyEqualPastSnapshot(getFilepath(name), summary);
					});
				}
			});
		});
	})
	.catch((e) => {
		throw e;
	});
