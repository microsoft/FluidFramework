/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { isCompatVersionBelowMinVersion } from "../describeCompat.js";
import { CompatKind } from "../../compatOptions.cjs";
import { getAllFluidVersions } from "../versionUtils.js";
import { pkgVersion } from "../packageVersion.js";

describe("Minimum Compat Version", () => {
	const versionMaps = getAllFluidVersions();

	it("bad min compat string", () => {
		const invalidString = "invalid string";
		try {
			isCompatVersionBelowMinVersion(invalidString, versionMaps, {
				name: `test`,
				kind: CompatKind.None,
				compatVersion: "2.0.0-rc.1.0.0",
			});
			assert.fail("test should fail");
		} catch (error: any) {
			assert.strictEqual(
				error.message,
				`Specified minimum version ${invalidString} not found in versions map`,
			);
		}
	});

	for (let i = 1; i < 9; i++) {
		it(`compatVersion N-${i} < current pkgVersion`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(pkgVersion, versionMaps, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: -i,
				}),
				true,
				`N-${i} is not lower than current pkgVersion ${pkgVersion}`,
			);
		});
	}

	it("2.0.0-internal.8.0.0 < 2.0.0-rc.1.0.0", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion("2.0.0-internal.8.0.0", versionMaps, {
				name: `test`,
				kind: CompatKind.None,
				compatVersion: "2.0.0-rc.1.0.0",
			}),
			false,
		);
	});

	it("cross compat", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion("2.0.0-internal.8.0.0", versionMaps, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "2.0.0-internal.8.0.0",
				loadVersion: "1.3.7",
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("2.0.0-internal.8.0.0", versionMaps, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: "2.0.0-internal.8.0.0",
			}),
			true,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", versionMaps, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "2.0.0-internal.8.0.0",
				loadVersion: "1.3.7",
			}),
			false,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion("1.3.7", versionMaps, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: "1.3.7",
				loadVersion: "2.0.0-internal.8.0.0",
			}),
			false,
		);
	});
});
