/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test as oclifTest } from "@oclif/test";

/**
 * Initializes the oclif command test environment. \@oclif/test cannot find the path to the project in some
 * circumstances, so as a workaround we configure it explicitly by passing in the URL to the test module itself.
 *
 * @param moduleUrl - The URL to the test module. In most cases you should pass the `import.meta.url` value for the test
 * module when calling this function.
 *
 * @returns A test function that can be used to test oclif commands.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function initializeCommandTestFunction(moduleUrl: string) {
	// @oclif/test cannot find the path to the project, so as a workaround we configure it explicitly
	return oclifTest.loadConfig({ root: moduleUrl });
}
