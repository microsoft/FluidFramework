/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import * as semver from "semver";

import { genCrossClientCompatConfig } from "../compatConfig.js";

describe("genCrossClientCompatConfig", () => {
	it("excludes versions below the deployed-client compatibility floor", () => {
		const configs = genCrossClientCompatConfig();
		assert.notEqual(configs.length, 0, "Expected cross-client compatibility configurations");

		for (const config of configs) {
			assert(
				config.createVersion !== undefined && config.loadVersion !== undefined,
				"Expected cross-client create and load versions",
			);
			for (const version of [config.createVersion, config.loadVersion]) {
				assert(
					semver.gte(version, lowestMinVersionForCollab),
					`${version} should not be below ${lowestMinVersionForCollab}`,
				);
			}
		}
	});
});
