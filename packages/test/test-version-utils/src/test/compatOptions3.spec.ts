/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { compatVersions } from "../compatOptions.js";

describe("compatOptions", () => {
	it("several flags in CLI form an array correctly ", () => {
		if (process.env.MOCHA_WORKER_ID === undefined) {
			// When running the test in the main moch processes, confirm the expected flags are being passed in CLI,
			// to ensure we're not testing with default values.
			const firstIndex = process.argv.findIndex((arg) => arg === `--compatVersion`);
			assert(firstIndex >= 0, `Expected CLI flag not found: --compatVersion`);
			const value = process.argv[firstIndex + 1];
			assert.equal(value, "0");
			const shiftedSecondIndex =
				process.argv.slice(firstIndex + 1).findIndex((arg) => arg === `--compatVersion`);
			assert(shiftedSecondIndex >= 0, `Second instance of --compatVersion flag not found`);

			const secondIndex = shiftedSecondIndex + firstIndex + 1;
			assert(secondIndex >= 0, `Second instance of --compatVersion flag not found`);
			const secondValue = process.argv[secondIndex + 1];
			assert.equal(secondValue, "-1");
		} else {
			// When running the test in a worker process, confirm it passed in the correct format
			const actualValue = process.env.fluid__test__compatVersion;
			assert.equal(actualValue, '["0","-1"]');
		}

		assert.deepEqual(compatVersions, ["0", "-1"]);
	});
});
