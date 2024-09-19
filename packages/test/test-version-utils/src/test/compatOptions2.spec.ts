/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { compatVersions } from "../compatOptions.js";

describe("compatOptions", () => {
	it("number-only compatVersion passes correctly", () => {
		if (process.env.MOCHA_WORKER_ID === undefined) {
			// When running the test in the main moch processes, confirm the expected flags are being passed in CLI,
			// to ensure we're not testing with default values.
			const keyIndex = process.argv.findIndex((arg) => arg === `--compatVersion`);
			assert(keyIndex >= 0, `Expected CLI flag not found: --compatVersion`);
			const value = process.argv[keyIndex + 1];
			assert.equal(value, "0");
		} else {
			// When running the test in a worker process, confirm it passed in the correct format
			const actualValue = process.env.fluid__test__compatVersion;
			assert.equal(actualValue, '["0"]');
		}

		assert.deepEqual(compatVersions, ["0"]);
	});
});
