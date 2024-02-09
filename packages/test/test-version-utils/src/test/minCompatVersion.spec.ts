/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { execSync } from "child_process";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";

describe("Minimum Compat Version", () => {
	const versionFromPackageJson = JSON.parse(
		execSync(`pnpm flub info --json`, {
			encoding: "utf-8",
		}),
	);
	const latestVersion = versionFromPackageJson["@fluidframework/container-loader"];

	it("bad min compat string", () => {
		const invalidString = "invalid string";
		assert.throws(
			() =>
				isCompatVersionBelowMinVersion(invalidString, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: "2.0.0-internal.8.0.0",
				}),
			(error: Error) => {
				return (
					error.message?.startsWith(
						`Error while running: npm v @fluidframework/container-loader`,
					) === true
				);
			},
			"Should fail when not sending a correct version",
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

	it("cross compat. filters out if loadVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(latestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: latestVersion,
				loadVersion: "1.3.7",
			}),
			true,
		);
	});

	it("cross compat. filters out if compatVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(latestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: latestVersion,
			}),
			true,
		);
	});

	it("cross compat. does not filter out valid versions", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: latestVersion,
				loadVersion: "1.3.7",
			}),
			false,
			`fails with minVersion: 1.3.7 compatversion: ${latestVersion} loadVersion: 1.3.7`,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: latestVersion,
			}),
			false,
			`fails with minVersion: 1.3.7 compatversion: 1.3.7 loadVersion: ${latestVersion}`,
		);
	});
});
