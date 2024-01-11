/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";
import { codeVersion } from "../baseVersion.js";

describe("Minimum Compat Version", () => {
	// const allVersionsFromNpm = execSync(`npm show fluid-framework versions --json`, {
	// 	encoding: "utf-8",
	// });
	// const allVersions: string[] = JSON.parse(allVersionsFromNpm);
	const latestVersion = codeVersion;

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

	it(`compatVersion N-0 == latest version ${latestVersion}`, () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(latestVersion, {
				name: `test`,
				kind: CompatKind.None,
				compatVersion: 0,
			}),
			false,
			`N-0 is lower than latestVersion`,
		);
	});

	for (let i = 1; i < 9; i++) {
		it(`compatVersion N-${i} < latest version ${latestVersion}`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(latestVersion, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: -i,
				}),
				true,
				`N-${i} is not lower than min version`,
			);
		});
	}

	it("cross compat", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(latestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: latestVersion,
				loadVersion: "1.3.7",
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion(latestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: latestVersion,
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: latestVersion,
				loadVersion: "1.3.7",
			}),
			false,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: latestVersion,
			}),
			false,
		);
	});
});
