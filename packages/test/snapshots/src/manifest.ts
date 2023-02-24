/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

interface ITestManifest {
	/** Tells whether testSummaries functionality is true. If so, the testSummaries ReplayArg is true. */
	testSummaries?: true;
}

/** The current content of the manifest. */
const currentManifest: ITestManifest = {
	testSummaries: true,
};

/**
 * Reads the content of the manifest folder in a given test folder and returns it. For older test folders before
 * manifest was added, returns an empty manifest.
 */
export function getManifest(folder: string): ITestManifest {
	const manifestFile = `${folder}/manifest.json`;
	if (!fs.existsSync(manifestFile)) {
		return {};
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
	const manifestFileName = `${folder}/manifest.json`;
	fs.writeFileSync(manifestFileName, JSON.stringify(currentManifest), {
		encoding: "utf-8",
	});
}
