/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import JSZip from "jszip";
import { Parser } from "xml2js";
import type { CommandLogger } from "../logging.js";

/**
 * The type for the coverage report, containing the line coverage and branch coverage(in percentage)
 */
export interface CoverageMetric {
	lineCoverage: number;
	branchCoverage: number;
}

interface XmlCoverageReportSchema {
	coverage: {
		packages: XmlCoverageReportSchemaForPackage[];
	};
}

interface XmlCoverageReportSchemaForPackage {
	package: [
		{
			"$": {
				name: string;
				"line-rate": string;
				"branch-rate": string;
			};
		},
	];
}

const extractCoverageMetrics = (
	xmlForCoverageReportFromArtifact: XmlCoverageReportSchema,
): Map<string, CoverageMetric> => {
	const report: Map<string, CoverageMetric> = new Map();
	const coverageForPackagesResult =
		xmlForCoverageReportFromArtifact.coverage.packages[0]?.package;

	for (const coverageForPackage of coverageForPackagesResult) {
		const packagePath = coverageForPackage.$.name;
		const lineCoverage = Number.parseFloat(coverageForPackage.$["line-rate"]) * 100;
		const branchCoverage = Number.parseFloat(coverageForPackage.$["branch-rate"]) * 100;
		if (packagePath && !Number.isNaN(lineCoverage) && !Number.isNaN(branchCoverage)) {
			report.set(packagePath, {
				lineCoverage,
				branchCoverage,
			});
		}
	}
	return report;
};

/**
 * Method that returns the coverage report for the build from the artifact.
 * @param baselineZip - zipped coverage files for the build
 * @param logger - The logger to log messages.
 * @returns an map of coverage metrics for build containing packageName, lineCoverage and branchCoverage
 */
export const getCoverageMetricsFromArtifact = async (
	artifactZip: JSZip,
	logger?: CommandLogger,
): Promise<Map<string, CoverageMetric>> => {
	const coverageReportsFiles: string[] = [];
	// eslint-disable-next-line unicorn/no-array-for-each -- required as JSZip does not implement [Symbol.iterator]() which is required by for...of
	artifactZip.forEach((filePath) => {
		if (filePath.endsWith("cobertura-coverage-patched.xml"))
			coverageReportsFiles.push(filePath);
	});

	let coverageMetricsForBaseline: Map<string, CoverageMetric> = new Map();
	const xmlParser = new Parser();

	try {
		logger?.info(`${coverageReportsFiles.length} coverage data files found.`);

		for (const coverageReportFile of coverageReportsFiles) {
			const jsZipObject = artifactZip.file(coverageReportFile);
			if (jsZipObject === undefined) {
				logger?.warning(
					`could not find file ${coverageReportFile} in the code coverage artifact`,
				);
			}

			// eslint-disable-next-line no-await-in-loop -- Since we only need 1 report file, it is easier to run it serially rather than extracting all jsZipObjects and then awaiting promises in parallel
			const coverageReportXML = await jsZipObject?.async("nodebuffer");
			if (coverageReportXML !== undefined) {
				xmlParser.parseString(
					coverageReportXML,
					(err: Error | null, result: unknown): void => {
						if (err) {
							console.warn(`Error processing file ${coverageReportFile}: ${err}`);
							return;
						}
						coverageMetricsForBaseline = extractCoverageMetrics(
							result as XmlCoverageReportSchema,
						);
					},
				);
			}
			if (coverageMetricsForBaseline.size > 0) {
				break;
			}
		}
	} catch (error) {
		logger?.warning(`Error encountered with reading files: ${error}`);
	}

	logger?.info(`${coverageMetricsForBaseline.size} packages with coverage data found.`);
	return coverageMetricsForBaseline;
};
