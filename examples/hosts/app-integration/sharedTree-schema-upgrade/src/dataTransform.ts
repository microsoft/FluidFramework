/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DataTransformationCallback } from "@fluid-example/example-utils";

/**
 * Read the version of the string data, to understand how to parse it.  This is shared between versions.
 * This format is just one example of how you might distinguish between multiple export formats, other approaches
 * are also totally fine.
 * @param stringData - The string data to examine
 * @returns The version string
 */
export function readVersion(stringData: string) {
	const lines = stringData.split("\n");
	const [versionTag, version] = lines[0].split(":");
	if (versionTag !== "version" || typeof version !== "string" || version === "") {
		throw new Error("Can't read version");
	}
	return version;
}

function transformToOne(stringData: string) {
	const treeData = stringData.split("\n");
	treeData.shift(); // remove version line
	return `version:one\n${treeData}`;
}

function transformToTwo(stringData: string) {
	const treeData = stringData.split("\n");
	treeData.shift(); // remove version line
	return `version:two\n${treeData}`;
}

/**
 * In this example, we can transform back and forth between versions one and two for demo purposes.  This way the
 * example can show migration multiple times.  However, in production scenarios it is not required to permit
 * backwards transformation -- more likely you'll want to take a daisy-chaining approach to convert data forwards
 * (1-\>2, 2-\>3, 3-\>4, etc.).  This way only one new transform function needs to be produced and tested for each new
 * format used.
 */
export const inventoryListDataTransformationCallback: DataTransformationCallback = async (
	exportedData: unknown,
	modelVersion: string,
) => {
	if (typeof exportedData !== "string") {
		throw new TypeError("Unexpected data format");
	}

	if (modelVersion === "one") {
		return transformToOne(exportedData);
	} else if (modelVersion === "two") {
		return transformToTwo(exportedData);
	} else {
		throw new Error(`Don't know how to transform for target version ${modelVersion}`);
	}
};
