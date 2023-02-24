/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

/**
 * The current version of the snapshot tests. This should be updated if there is a change in how the tests validates
 * snapshot. For example, there was a change to generate snapshots not at fixed points (after 1000 ops) but at the same
 * points (sequence numbers) as what happened in the original file. The version was upgraded because snapshots added
 * before and after that point ran different validations.
 */
export const currentTestVersion: number = 2;
/**
 * The version of the test after which "testSummaries" replay args is set, indicating that snapshots need to be
 * generated at the same points as the original file did.
 */
export const testSummariesVersion: number = 2;

interface ITestManifest {
	/** The version of the snapshot tests when a particular test folder was added. */
	testVersion: number;
}

/**
 * The manifest to use for older snapshots before manifest was added.
 */
const legacyManifest: ITestManifest = {
	testVersion: 1,
};

/**
 * Reads the content of the manifest folder in a given test folder and returns it. For older test folders before
 * manifest was added, returns a legacy manifest.
 */
export function getManifest(folder: string): ITestManifest {
	const manifestFile = `${folder}/manifest.json`;
	if (!fs.existsSync(manifestFile)) {
		return legacyManifest;
	}

	const manifestContent = JSON.parse(
		fs.readFileSync(`${manifestFile}`, "utf-8"),
	) as ITestManifest;
	return manifestContent;
}

/**
 * Writes the manifest file in the given test folder.
 */
export function writeManifestFile(folder: string) {
	const manifestContent: ITestManifest = { testVersion: currentTestVersion };
	const manifestFileName = `${folder}/manifest.json`;
	fs.writeFileSync(manifestFileName, JSON.stringify(manifestContent), {
		encoding: "utf-8",
	});
}
