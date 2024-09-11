/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import globby from "globby";
import JSZip from "jszip";
import { Parser } from "xml2js";

/**
 * The type for the coverage report, containing the name of the package, line coverage and branch coverage
 */
export interface CoverageReport {
	packageName: string;
	lineCoverage: number;
	branchCoverage: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- missing type for XML output
const extractCoverageMetrics = (result: any): CoverageReport[] => {
	const report: CoverageReport[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const coverageForPackagesResult = result?.coverage?.packages?.[0]?.package as any[];

	for (const coverageForPackage of coverageForPackagesResult) {
		const packageName = coverageForPackage["$"].name as string;
		const lineCoverage = Number.parseFloat(coverageForPackage["$"]["line-rate"]);
		const branchCoverage = Number.parseFloat(coverageForPackage["$"]["branch-rate"]);
		report.push({
			packageName,
			lineCoverage,
			branchCoverage,
		});
	}

	return report;
};

/**
 * Method that returns the coverage report for the baseline build
 * @param baselineZip - zipped coverage files for the baseline build
 * @returns an array of coverage metrics for baseline containing packageName, lineCoverage and branchCoverage
 */
export const getCoverageMetricsForBaseline = async (
	baselineZip: JSZip,
): Promise<CoverageReport[]> => {
	const coverageReportsFiles: string[] = [];
	baselineZip.forEach((filePath) => {
		if (filePath.endsWith("cobertura-coverage-patched.xml"))
			coverageReportsFiles.push(filePath);
	});

	const coverageMetricsForBaseline: CoverageReport[] = [];
	const xmlParser = new Parser();

	try {
		console.log(`${coverageReportsFiles.length} coverage files found in baseline`);

		for (const coverageReportFile of coverageReportsFiles) {
			const jsZipObject = baselineZip.file(coverageReportFile);
			if (!jsZipObject) {
				console.log(`could not find file ${coverageReportFile} in baseline`);
			}

			const coverageReportXML = await jsZipObject?.async("nodebuffer");
			if (coverageReportXML !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- missing type for XML output
				xmlParser.parseString(coverageReportXML, (err: Error | null, result: any): void => {
					if (err) {
						console.warn(`Error processing file ${coverageReportFile}: ${err} in baseline`);
						return;
					}
					const metrics = extractCoverageMetrics(result);
					metrics.forEach((metric: CoverageReport) => {
						if (
							metric.packageName &&
							!Number.isNaN(metric.lineCoverage) &&
							!Number.isNaN(metric.branchCoverage) &&
							metric.lineCoverage < 1
						) {
							coverageMetricsForBaseline.push(metric);
						}
					});
				});
			}
			if (coverageMetricsForBaseline.length > 0) {
				break;
			}
		}
	} catch (error) {
		console.log(`Error encountered with reading files: ${error} in baseline`);
	}

	console.log(`${coverageMetricsForBaseline.length} coverage reports generated`);
	return coverageMetricsForBaseline;
};

/**
 * Method that returns the coverage metrics for the pr
 * @param coverageReportsFolder - The folder where the coverage reports for the pr can be found
 * @returns an array of coverage metrics for baseline containing packageName, lineCoverage and branchCoverage
 */
export const getCoverageMetricsForPr = async (
	coverageReportsFolder: string,
): Promise<CoverageReport[]> => {
	const coverageMetricsForPr: CoverageReport[] = [];
	const coverageReportsFiles = await globby(
		path.posix.join(coverageReportsFolder, "cobertura-coverage-patched.xml"),
	);

	const xmlParser = new Parser();

	console.log(`${coverageReportsFiles.length} coverage files found in PR`);

	for (const coverageReportFile of coverageReportsFiles) {
		const coverageReportXML = await fs.readFile(coverageReportFile, "utf8");
		try {
			const result = await xmlParser.parseStringPromise(coverageReportXML);
			const metrics = extractCoverageMetrics(result);
			metrics.forEach((metric: CoverageReport) => {
				if (
					metric.packageName &&
					!Number.isNaN(metric.lineCoverage) &&
					!Number.isNaN(metric.branchCoverage) &&
					metric.lineCoverage < 1
				) {
					coverageMetricsForPr.push(metric);
				}
			});
			if (coverageMetricsForPr.length > 0) {
				break;
			}
		} catch (error) {
			console.warn(`Error processing file ${coverageReportFile}: ${error} in PR`);
			continue;
		}
	}

	return coverageMetricsForPr;
};
