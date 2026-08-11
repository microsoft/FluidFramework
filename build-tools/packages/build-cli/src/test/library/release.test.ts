/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { getLegacyCompatRange } from "../../library/release.js";

interface TestMatrix {
	inputVersion: string;
	subCases: {
		[interval: number]: string | Error;
	};
}

describe("Legacy compatibility ranges", () => {
	const testMatrix: TestMatrix[] = [
		{
			inputVersion: "2.0.9",
			// For version 2.0.9 with intervals:
			// 10 => ">=2.0.9 <2.10.0"
			// 20 => ">=2.0.9 <2.20.0"
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
			// For version 2.8.10 with intervals:
			// 10 => ">=2.8.10 <2.10.0"
			// 20 => ">=2.8.10 <2.20.0"
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
			// For version 2.18.10 with intervals:
			// 10 => ">=2.18.10 <2.20.0"
			// 20 => ">=2.18.10 <2.20.0"
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
			// For version 2.0.10 with intervals:
			// 10 => ">=2.0.10 <2.20.0"
			// 20 => ">=2.18.10 <2.20.0"
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
		{
			inputVersion: "2.0.0-internal.3.5.2",
			subCases: {
				10: new Error("Internal version schema is not supported"),
			},
		},
		{
			inputVersion: "2.5.0-300362",
			subCases: {
				10: new Error("Prerelease section is not expected"),
			},
		},
	];

	for (const { inputVersion, subCases } of testMatrix) {
		for (const [interval, upperBound] of Object.entries(subCases)) {
			const expected = `>=${inputVersion} <${upperBound}`;
			if (upperBound instanceof Error) {
				it(`should throw error for input version '${inputVersion}' and interval '${interval}'`, () => {
					assert.throws(
						() => getLegacyCompatRange(inputVersion, Number.parseInt(interval, 10)),
						Error,
					);
				});
			} else {
				it(`legacy compat: ${inputVersion} and compat version interval ${interval} yields ${expected}`, () => {
					const range = getLegacyCompatRange(inputVersion, Number.parseInt(interval, 10));
					assert.strictEqual(range, expected);
				});
			}
		}
	}
});
