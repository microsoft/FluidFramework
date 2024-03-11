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

/**
 * Transforms a dev version into its internal version. If dev patterns are not found,
 * it returns the input without any changes.
 * Examples:
 * a.b.c-dev-rc.x.y.z.nnnnnn returns: a.b.c-rc.x.y.z
 * a.b.c-dev.x.y.z.nnnnnn returns: a.b.c-internal.x.y.z
 */
function transformDevVersion(version: string): string {
	let regex = /(\d+)\.(\d+)\.(\d+)-dev-(\w+)\.(\d+)\.(\d+)\.(\d+)\.\d+/;
	let matches = version.match(regex);

	if (matches) {
		const [, major, minor, patch, label, num1, num2, num3] = matches;
		return `${major}.${minor}.${patch}-${label}.${num1}.${num2}.${num3}`;
	} else {
		regex = /(\d+)\.(\d+)\.(\d+)-dev\.(\d+)\.(\d+)\.(\d+)\.\d+/;
		matches = version.match(regex);
		if (matches) {
			const [, major, minor, patch, num1, num2, num3] = matches;
			return `${major}.${minor}.${patch}-internal.${num1}.${num2}.${num3}`;
		}
		return version;
	}
}

describe("Minimum Compat Version", () => {
	const minTestVersion = transformDevVersion(pkgVersion);
	const numCompatVersions = 9;
	const versions = [
		"1.3.7",
		"2.0.0-internal.1.0.0",
		"2.0.0-internal.1.1.0",
		"2.0.0-internal.1.2.0",
		"2.0.0-internal.1.4.0",
		"2.0.0-internal.2.0.0",
		"2.0.0-internal.2.1.0",
		"2.0.0-internal.2.2.0",
		"2.0.0-internal.2.3.0",
		"2.0.0-internal.2.4.0",
		"2.0.0-internal.3.0.0",
		"2.0.0-internal.3.1.0",
		"2.0.0-internal.3.2.0",
		"2.0.0-internal.3.3.0",
		"2.0.0-internal.3.4.0",
		"2.0.0-internal.4.0.0",
		"2.0.0-internal.4.1.0",
		"2.0.0-internal.4.2.0",
		"2.0.0-internal.4.3.0",
		"2.0.0-internal.4.4.0",
		"2.0.0-internal.5.0.0",
		"2.0.0-internal.5.1.0",
		"2.0.0-internal.5.2.0",
		"2.0.0-internal.5.3.0",
		"2.0.0-internal.5.4.0",
		"2.0.0-internal.6.0.0",
		"2.0.0-internal.6.1.0",
		"2.0.0-internal.6.2.0",
		"2.0.0-internal.6.3.0",
		"2.0.0-internal.6.4.0",
		"2.0.0-internal.7.0.0",
		"2.0.0-internal.7.1.0",
		"2.0.0-internal.7.2.0",
		"2.0.0-internal.7.3.0",
		"2.0.0-internal.7.4.0",
		"2.0.0-internal.8.0.0",
		"2.0.0-rc.1.0.0",
		"2.0.0-rc.2.0.0",
		"2.0.0-rc.3.0.0",
	];

	it("dev transform version", () => {
		assert.strictEqual(transformDevVersion("2.0.0-internal.3.0.0"), "2.0.0-internal.3.0.0");
		assert.strictEqual(transformDevVersion("2.0.0-dev-rc.3.0.0.223149"), "2.0.0-rc.3.0.0");
		assert.strictEqual(transformDevVersion("2.0.0-rc.3.0.0"), "2.0.0-rc.3.0.0");
		assert.strictEqual(transformDevVersion("2.0.0-dev.6.4.0.192049"), "2.0.0-internal.6.4.0");
	});

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

	// N-1 check will fail while releasing a new version during bump version PR since pkgVersion will be one version ahead of latest release.
	// In order to avoid conflicts every time we bump, we removed N-1 test.
	for (let i = 2; i < numCompatVersions; i++) {
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

	for (let i = numCompatVersions; i < versions.length; i++) {
		for (let j = i - 1; j >= i - numCompatVersions; j--) {
			it(`version ${versions[j]} should be below version ${versions[i]}`, () => {
				assert.strictEqual(
					isCompatVersionBelowMinVersion(versions[i], {
						name: `test`,
						kind: CompatKind.None,
						compatVersion: versions[j],
					}),
					true,
					`version: "${versions[i]}" is not lower than ${versions[j]}`,
				);
			});
		}
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
