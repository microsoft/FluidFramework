/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";
import { baseVersion } from "../baseVersion.js";

describe("Minimum Compat Version", () => {
	it("bad min compat string", () => {
		const invalidString = "invalid string";
		try {
			isCompatVersionBelowMinVersion(invalidString, {
				name: `test`,
				kind: CompatKind.None,
				compatVersion: "2.0.0-internal.8.0.0",
			});
			assert.fail("test should fail");
		} catch (error: any) {
			assert.strictEqual(
				error.message,
				`Error while running: npm v @fluidframework/container-loader@"${invalidString}" version --json`,
			);
		}
	});

	// N-1 version is 2.0.0-internal.8.0.0
	// N-2 version is 2.0.0-internal.8.0.0 (bug?)
	// therefore start testing on N-3
	for (let i = 1; i < 9; i++) {
		it(`compatVersion N-${i} < latest version`, () => {
			assert.strictEqual(
				// using latest version found in allVersions array.
				isCompatVersionBelowMinVersion(baseVersion, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: -i,
				}),
				true,
				`N-${i} is not lower than current base version ${baseVersion}`,
			);
		});
	}

	it("cross compat", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(baseVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: baseVersion,
				loadVersion: "1.3.7",
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion(baseVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: baseVersion,
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: baseVersion,
				loadVersion: "1.3.7",
			}),
			false,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: baseVersion,
			}),
			false,
		);
	});
});
