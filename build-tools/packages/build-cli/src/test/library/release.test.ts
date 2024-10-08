/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { getInternalVersionRange } from "../../library/release.js";

interface TestMatrix {
	inputVersion: string;
	subCases: {
		[interval: number]: string;
	};
}

describe("Legacy compatibility ranges", () => {
	const testMatrix: TestMatrix[] = [
		{
			inputVersion: "2.0.9",
			subCases: {
				10: "2.10.0",
				20: "2.20.0",
				25: "2.25.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.8.10",
			subCases: {
				10: "2.10.0",
				20: "2.20.0",
				25: "2.25.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.18.10",
			subCases: {
				10: "2.20.0",
				20: "2.20.0",
				25: "2.25.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.0.10",
			subCases: {
				10: "2.10.0",
				20: "2.20.0",
				25: "2.25.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.10.0",
			subCases: {
				10: "2.20.0",
				20: "2.20.0",
				25: "2.25.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.25.0",
			subCases: {
				10: "2.30.0",
				20: "2.40.0",
				25: "2.50.0",
				30: "2.30.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
		{
			inputVersion: "2.39.10",
			subCases: {
				10: "2.40.0",
				20: "2.40.0",
				25: "2.50.0",
				30: "2.60.0",
				40: "2.40.0",
				50: "2.50.0",
				200: "2.200.0",
			},
		},
	];

	for (const { inputVersion, subCases } of testMatrix) {
		for (const [interval, upperBound] of Object.entries(subCases)) {
			it(`legacy compat: ${inputVersion} and compat version interval ${interval} yields ">=${inputVersion} <${upperBound}"`, () => {
				const range = getInternalVersionRange(inputVersion, Number.parseInt(interval, 10));
				assert.strictEqual(range, `>=${inputVersion} <${upperBound}`);
			});
		}
	}
});
