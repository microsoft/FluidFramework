/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as oclifTest } from "@oclif/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initializes the oclif command test environment. \@oclif/test cannot find the path to the project in some
 * circumstances, so as a workaround we configure it explicitly by passing in the URL to the test module itself.
 *
 * @param moduleUrl - The URL to the test module. In most cases you should pass the `import.meta.url` value for the test
 * module when calling this function.
 *
 * @returns A test function that can be used to test oclif commands.
 */
export function initializeCommandTestFunction(
	moduleUrl: string,
): ReturnType<typeof oclifTest.loadConfig> {
	// @oclif/test cannot find the path to the project, so as a workaround we configure it explicitly
	return oclifTest.loadConfig({ root: moduleUrl });
}

/**
 * The absolute path to the test data for this package.
 */
export function getTestDataPath(): string {
	return path.resolve(__dirname, "../../src/test/data");
}
