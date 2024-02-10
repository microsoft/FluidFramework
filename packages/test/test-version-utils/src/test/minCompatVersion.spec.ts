/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";
import { pkgVersion } from "../packageVersion.js";
import { getRequestedVersion } from "../versionUtils.js";
import { testBaseVersion } from "../baseVersion.js";

function transformVersion(version: string): string {
	const regex = /(\d+)\.(\d+)\.(\d+)-dev-(\w+)\.(\d+)\.(\d+)\.(\d+)\.\d+/;
	const matches = version.match(regex);

	if (matches) {
		const [, major, minor, patch, label, num1, num2, num3] = matches;
		return `${major}.${minor}.${patch}-${label}.${num1}.${num2}.${num3}`;
	} else {
		return version;
	}
}

describe("Minimum Compat Version", () => {
	// const allVersionsFromNpm = execSync(`npm show fluid-framework versions --json`, {
	// 	encoding: "utf-8",
	// });
	// const allVersions: string[] = JSON.parse(allVersionsFromNpm);
	// // filter out all versions that don't end with 0 (patches). This is done because N-0 version
	// // is pkgVersion and this variable only updates in minor releases. So it could be the case that latest
	// // version is a patch and our N-0 version is behind it.
	// const noPatchVersions = allVersions.filter((version) => /\.\d*0$/.test(version));
	const minTestVersion = transformVersion(pkgVersion);

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
		it(`compatVersion N-${i} < ${minTestVersion}`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(minTestVersion, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: -i,
				}),
				true,
				`N-${i} version: "${getRequestedVersion(
					testBaseVersion(-i),
					-i,
				)}"  is not lower than min version: ${minTestVersion}`,
			);
		});
	}

	it("cross compat. filters out if loadVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(minTestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: minTestVersion,
				loadVersion: "1.3.7",
			}),
			true,
		);
	});

	it("cross compat. filters out if compatVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(minTestVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: minTestVersion,
			}),
			true,
		);
	});

	it("cross compat. does not filter out valid versions", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: minTestVersion,
				loadVersion: "1.3.7",
			}),
			false,
			`fails with minVersion: 1.3.7 compatversion: ${minTestVersion} loadVersion: 1.3.7`,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: minTestVersion,
			}),
			false,
			`fails with minVersion: 1.3.7 compatversion: 1.3.7 loadVersion: ${minTestVersion}`,
		);
	});
});
