/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Parser } from "xml2js";
import JSZip from "jszip";
import * as fs from "fs/promises";
import { glob } from "glob";
import * as path from "path";

/**
 * The type for the coverage report, containing the name of the package, line coverage and branch coverage
 */
export type CoverageReport = {
	packageName: string;
	lineCoverage: number;
	branchCoverage: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- missing type for XML output
const extractCoverageMetrics = (result: any): CoverageReport[] => {
	const report: CoverageReport[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const coverageForPackagesResult = result?.coverage?.packages?.[0]?.package as any[];
	coverageForPackagesResult?.forEach((coverageForPackage) => {
		const packageName = coverageForPackage["$"].name as string;
		const lineCoverage = parseFloat(coverageForPackage["$"]["line-rate"]);
		const branchCoverage = parseFloat(coverageForPackage["$"]["branch-rate"]);
		report.push({
			packageName,
			lineCoverage,
			branchCoverage,
		});
	});
	return report;
};

/**
 * Method that returns the coverage report for the baseline build
 * @param baselineZip zipped coverage files for the baseline build
 * @returns an array of coverage metrics for baseline containing packageName, lineCoverage and branchCoverage
 */
export const getCoverageMetricsForBaseline = async (baselineZip: JSZip) => {
	const coverageReportsFiles: string[] = [];
	baselineZip.forEach((path) => {
		if (path.endsWith("cobertura-coverage-patched.xml")) coverageReportsFiles.push(path);
	});

	const coverageMetricsForBaseline: CoverageReport[] = [];
	const xmlParser = new Parser();

	try {
		console.log(`${coverageReportsFiles.length} coverage files found`);

		await Promise.all(
			coverageReportsFiles.map(async (coverageReportFile: string) => {
				const jsZipObject = baselineZip.file(coverageReportFile);
				if (!jsZipObject) {
					console.log(`could not find file ${coverageReportFile}`);
				}

				const coverageReportXML = await jsZipObject?.async("nodebuffer");
				let count = 0;
				coverageReportXML &&
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- missing type for XML output
					xmlParser.parseString(
						coverageReportXML,
						function (err: Error | null, result: unknown): void {
							if (err) {
								console.warn(`Error processing file ${coverageReportFile}: ${err}`);
								return;
							}
							count++;
							const metrics = extractCoverageMetrics(result);
							metrics.forEach((metric: CoverageReport) => {
								if (
									metric.packageName &&
									!isNaN(metric.lineCoverage) &&
									!isNaN(metric.branchCoverage) &&
									metric.lineCoverage < 1
								) {
									coverageMetricsForBaseline.push(metric);
								}
							});
						},
					);
				console.log("count", count);
			}),
		);
	} catch (error) {
		console.log(`Error encountered with reading files: ${error}`);
	}

	console.log(`${coverageMetricsForBaseline.length} coverage reports generated`);
	return coverageMetricsForBaseline;
};

/**
 * Method that returns the coverage metrics for the pr
 * @param coverageReportsFolder The folder where the coverage reports for the pr can be found
 * @returns an array of coverage metrics for baseline containing packageName, lineCoverage and branchCoverage
 */
export const getCoverageMetricsForPr = async (coverageReportsFolder: string) => {
	const coverageMetricsForPr: CoverageReport[] = [];
	const coverageReportsFiles = await glob(
		path.join(coverageReportsFolder, "*cobertura-coverage-patched.xml"),
	);
	const coverageReportsFiles1 = await glob(
		path.join("./codeCoverageAnalysis", "*cobertura-coverage-patched.xml"),
	);
	const coverageReportsFiles2 = await glob(path.join("./", "*cobertura-coverage-patched.xml"));
	const coverageReportsFiles3 = await glob(
		path.join(coverageReportsFolder, "cobertura-coverage-patched.xml"),
	);

	const xmlParser = new Parser();

	console.log(`${coverageReportsFiles.length} coverage files found`);
	console.log(`${coverageReportsFiles1.length} coverage files found`);
	console.log(`${coverageReportsFiles2.length} coverage files found`);
	console.log(`${coverageReportsFiles3.length} coverage files found`);

	await Promise.all(
		coverageReportsFiles.map(async (coverageReportFile: string) => {
			const coverageReportXML = await fs.readFile(coverageReportFile, "utf-8");
			try {
				const result = await xmlParser.parseStringPromise(coverageReportXML);
				const metrics = extractCoverageMetrics(result);
				metrics.forEach((metric: CoverageReport) => {
					if (
						metric.packageName &&
						!isNaN(metric.lineCoverage) &&
						!isNaN(metric.branchCoverage) &&
						metric.lineCoverage < 1
					) {
						coverageMetricsForPr.push(metric);
					}
				});
			} catch (err) {
				console.warn(`Error processing file ${coverageReportXML}: ${err}`);
				return;
			}
		}),
	);

	return coverageMetricsForPr;
};
