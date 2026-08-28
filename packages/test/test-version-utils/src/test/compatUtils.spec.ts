/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { featureVersion } from "@fluidframework/driver-definitions/internal";

import { getMinVersionForCollab } from "../compatUtils.js";
import { pkgVersion } from "../packageVersion.js";

describe("compatUtils", () => {
	describe("getMinVersionForCollab", () => {
		it("normalizes the current package version for feature selection", () => {
			assert.equal(getMinVersionForCollab(pkgVersion, pkgVersion), featureVersion(pkgVersion));
		});

		it("preserves explicitly requested patch versions", () => {
			assert.equal(getMinVersionForCollab("2.42.1", "2.43.2"), "2.42.1");
		});

		it("preserves explicitly requested 2.0.0-defaults", () => {
			assert.equal(getMinVersionForCollab("2.42.1", "2.0.0-defaults"), "2.0.0-defaults");
		});
	});
});
