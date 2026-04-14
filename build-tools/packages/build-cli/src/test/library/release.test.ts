/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";
import {
	extractBuildNumber,
	generateReportFileName,
	getLegacyCompatRange,
	toReportKind,
	type ReleaseDetails,
	type ReleaseReport,
} from "../../library/release.js";

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

describe("extractBuildNumber", () => {
	it("extracts build number from a standard prerelease version", () => {
		assert.strictEqual(extractBuildNumber("2.1.0-260312"), 260312);
	});

	it("extracts build number from another numeric prerelease version", () => {
		assert.strictEqual(extractBuildNumber("3.0.0-123456"), 123456);
	});

	it("extracts build number from an internal test version", () => {
		assert.strictEqual(extractBuildNumber("0.0.0-260312-test"), 260312);
	});
});

describe("generateReportFileName", () => {
	it("uses baseFileName when provided", () => {
		assert.strictEqual(
			generateReportFileName("caret", "2.0.0", "client", "myReport"),
			"myReport.caret.json",
		);
	});

	it("uses baseFileName for any kind when provided", () => {
		assert.strictEqual(
			generateReportFileName("full", "2.0.0", undefined, "output"),
			"output.full.json",
		);
	});

	it("generates filename with release group and version when no baseFileName", () => {
		assert.strictEqual(
			generateReportFileName("caret", "2.1.0", "client"),
			"fluid-framework-release-manifest.client.2.1.0.caret.json",
		);
	});

	it("generates filename with 'all' when no release group or baseFileName", () => {
		assert.strictEqual(
			generateReportFileName("simple", "2.1.0"),
			"fluid-framework-release-manifest.all.2.1.0.simple.json",
		);
	});

	it("generates filename for legacy-compat kind", () => {
		assert.strictEqual(
			generateReportFileName("legacy-compat", "2.0.0", "client"),
			"fluid-framework-release-manifest.client.2.0.0.legacy-compat.json",
		);
	});
});

describe("toReportKind", () => {
	const sampleDetails: ReleaseDetails = {
		version: "2.1.0",
		previousVersion: "2.0.0",
		versionScheme: "semver",
		releaseType: "minor",
		isNewRelease: true,
		ranges: {
			minor: "^2.1.0",
			patch: "~2.1.0",
			caret: "^2.1.0",
			tilde: "~2.1.0",
			legacyCompat: ">=2.1.0 <2.10.0",
		},
	};

	const sampleReport: ReleaseReport = {
		"@fluidframework/foo": { ...sampleDetails },
		"@fluidframework/bar": {
			...sampleDetails,
			version: "2.2.0",
			ranges: {
				minor: "^2.2.0",
				patch: "~2.2.0",
				caret: "^2.2.0",
				tilde: "~2.2.0",
				legacyCompat: ">=2.2.0 <2.10.0",
			},
		},
	};

	it("returns the full report unchanged for 'full' kind", () => {
		const result = toReportKind(sampleReport, "full");
		assert.strictEqual(result, sampleReport);
	});

	it("maps to version strings for 'simple' kind", () => {
		const result = toReportKind(sampleReport, "simple") as Record<string, string>;
		assert.strictEqual(result["@fluidframework/foo"], "2.1.0");
		assert.strictEqual(result["@fluidframework/bar"], "2.2.0");
	});

	it("maps to caret ranges for 'caret' kind", () => {
		const result = toReportKind(sampleReport, "caret") as Record<string, string>;
		assert.strictEqual(result["@fluidframework/foo"], "^2.1.0");
		assert.strictEqual(result["@fluidframework/bar"], "^2.2.0");
	});

	it("maps to tilde ranges for 'tilde' kind", () => {
		const result = toReportKind(sampleReport, "tilde") as Record<string, string>;
		assert.strictEqual(result["@fluidframework/foo"], "~2.1.0");
		assert.strictEqual(result["@fluidframework/bar"], "~2.2.0");
	});

	it("maps to legacyCompat ranges for 'legacy-compat' kind", () => {
		const result = toReportKind(sampleReport, "legacy-compat") as Record<string, string>;
		assert.strictEqual(result["@fluidframework/foo"], ">=2.1.0 <2.10.0");
		assert.strictEqual(result["@fluidframework/bar"], ">=2.2.0 <2.10.0");
	});

	it("throws for unknown kind", () => {
		assert.throws(
			() => toReportKind(sampleReport, "unknown" as never),
			/Unexpected ReportKind/,
		);
	});
});
