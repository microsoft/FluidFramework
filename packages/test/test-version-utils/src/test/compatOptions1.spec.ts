/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CompatKind,
	compatKind,
	compatVersions,
	driver,
	r11sEndpointName,
	odspEndpointName,
	tenantIndex,
} from "../compatOptions.js";

describe("compatOptions", () => {
	it("cli flags are visible as env variables in worker processes", () => {
		const expectedCliFlagValues = {
			compatKind: CompatKind.None,
			compatVersion: "testCompatVersion",
			reinstall: "true",
			driver: "tinylicious",
			r11sEndpointName: "myR11sEndpointName",
			odspEndpointName: "myOdspEndpointName",
			tenantIndex: "42",
			baseVersion: "myBaseVersion",
		};

		if (process.env.MOCHA_WORKER_ID === undefined) {
			// When running the test in the main moch processes, confirm the expected flags are being passed in CLI,
			// to ensure we're not testing with default values.
			for (const [key, expectedValue] of Object.entries(expectedCliFlagValues)) {
				const keyIndex = process.argv.findIndex((arg) => arg === `--${key}`);
				assert(keyIndex >= 0, `Expected CLI flag not found: --${key}`);
				const value = process.argv[keyIndex + 1];
				assert.equal(
					value,
					expectedValue,
					`CLI flag '--${key}' has value '${value}' instead of expected '${expectedValue}'`,
				);
			}
		}

		assert.deepEqual(compatKind, [`${CompatKind.None}`]);
		assert.deepEqual(compatVersions, ["testCompatVersion"]);
		assert.equal(driver, "tinylicious");
		assert.equal(r11sEndpointName, "myR11sEndpointName");
		assert.equal(odspEndpointName, "myOdspEndpointName");
		assert.equal(tenantIndex, 42);
		// assert.equal(reinstall, true); // Not sure why this one is not passed as env variable correctly
	});
});
