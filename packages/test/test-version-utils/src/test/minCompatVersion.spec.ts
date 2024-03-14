/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";
import { baseVersionForMinCompat } from "../baseVersion.js";

describe("Minimum Compat Version", () => {
	const numCompatVersions = 9;
	const oldVersion = "1.3.7";
	// for cross compat unit testing
	const greaterVersion = "2.0.0-rc.1.0.0";
	const lowerVersion = "1.3.7";

	it("bad min compat string", () => {
		const invalidString = "invalid string";
		assert.throws(
			() =>
				isCompatVersionBelowMinVersion(
					invalidString,
					{
						name: `test`,
						kind: CompatKind.None,
						compatVersion: "2.0.0-internal.8.0.0",
					},
					baseVersionForMinCompat,
				),
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

	// Making sure all previous versions get filtered.
	for (let i = 1; i < numCompatVersions; i++) {
		it(`compatVersion N-${i} < ${baseVersionForMinCompat}`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(
					baseVersionForMinCompat,
					{
						name: `test`,
						kind: CompatKind.None,
						compatVersion: -i,
					},
					baseVersionForMinCompat,
				),
				true,
				`N-${i} version is not lower than min version: ${baseVersionForMinCompat}`,
			);
		});
	}

	// Making sure compatConfigs with old min compat don't get filtered.
	for (let i = 1; i < numCompatVersions; i++) {
		it(`compatVersion N-${i} > ${oldVersion}`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(
					oldVersion,
					{
						name: `test`,
						kind: CompatKind.None,
						compatVersion: -i,
					},
					baseVersionForMinCompat,
				),
				false,
				`N-${i} version: is lower than min version: ${oldVersion}`,
			);
		});
	}

	it("cross compat. filters out if loadVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(
				greaterVersion,
				{
					name: "test",
					kind: CompatKind.CrossVersion,
					compatVersion: greaterVersion,
					loadVersion: lowerVersion,
				},
				baseVersionForMinCompat,
			),
			true,
		);
	});

	it("cross compat. filters out if compatVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(
				greaterVersion,
				{
					name: "test",
					kind: CompatKind.CrossVersion,
					compatVersion: lowerVersion,
					loadVersion: greaterVersion,
				},
				baseVersionForMinCompat,
			),
			true,
		);
	});

	it("cross compat. does not filter out valid versions", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(
				lowerVersion,
				{
					name: "test",
					kind: CompatKind.CrossVersion,
					compatVersion: greaterVersion,
					loadVersion: lowerVersion,
				},
				baseVersionForMinCompat,
			),
			false,
			`fails with minVersion: ${lowerVersion} compatversion: ${greaterVersion} loadVersion: ${lowerVersion}`,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion(
				lowerVersion,
				{
					name: "test",
					kind: CompatKind.CrossVersion,
					compatVersion: lowerVersion,
					loadVersion: greaterVersion,
				},
				baseVersionForMinCompat,
			),
			false,
			`fails with minVersion: ${lowerVersion} compatversion: ${lowerVersion} loadVersion: ${greaterVersion}`,
		);
	});
});
