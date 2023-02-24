/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

interface ITestMetadata {
	/** Tells whether testSummaries functionality is true. If so, the testSummaries ReplayArg is true. */
	testSummaries?: true;
}

/** The current metadata value. */
const currentMetadata: ITestMetadata = {
	testSummaries: true,
};

const metadataFileName = "metadata.json";

/**
 * Reads the content of the metadata folder in a given test folder and returns it. For older test folders before
 * metadata was added, returns an empty metadata.
 */
export function getMetadata(folder: string): ITestMetadata {
	const metadataFile = `${folder}/${metadataFileName}`;
	if (!fs.existsSync(metadataFile)) {
		return {};
	}

	const metadataContent = JSON.parse(
		fs.readFileSync(`${metadataFile}`, "utf-8"),
	) as ITestMetadata;
	return metadataContent;
}

/**
 * Writes the metadata file in the given test folder.
 */
export function writeMetadataFile(folder: string) {
	const metadataFile = `${folder}/${metadataFileName}`;
	fs.writeFileSync(metadataFile, JSON.stringify(currentMetadata), {
		encoding: "utf-8",
	});
}
