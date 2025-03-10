/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import JSZip from "jszip";
import { Parser } from "xml2js";
import type { CommandLogger } from "../logging.js";

/**
 * The type for the coverage metric, containing the line, method and branch coverage(in percentage)
 */
export interface CoverageMetric {
	lineCoverage: number;
	branchCoverage: number;
	methodCoverage: number;
}

/**
 * The type for the coverage metric for files in package, containing the line, method and branch coverage(in percentage)
 */
export interface CoverageMetricForPackages extends CoverageMetric {
	filesCoverage: Map<string, CoverageMetric>;
}

interface XmlCoverageReportSchema {
	coverage: {
		"$": {
			"line-rate": string;
			"branch-rate": string;
		};
		packages: [
			{
				package: XmlCoverageReportSchemaForPackage[];
			},
		];
	};
}

interface XmlCoverageReportSchemaForPackage {
	"$": {
		name: string;
		"line-rate": string;
		"branch-rate": string;
	};
	classes: [
		{
			class?: XmlCoverageReportSchemaForFile[];
		},
	];
}

interface XmlCoverageReportSchemaForFile {
	"$": {
		name: string;
		"line-rate": string;
		"branch-rate": string;
		filename: string;
	};
	methods: [
		{
			method?: XmlCoverageReportSchemaForMethod[];
		},
	];
}

interface XmlCoverageReportSchemaForMethod {
	"$": {
		name: string;
		"hits": string;
	};
}

function extractCoverageForEachFiles(
	coverageForFiles: XmlCoverageReportSchemaForFile[] | undefined,
): {
	filesCoverage: Map<string, CoverageMetric>;
	packageMethodCoverage: number;
} {
	const filesCoverage: Map<
		string,
		{
			lineCoverage: number;
			branchCoverage: number;
			methodCoverage: number;
		}
	> = new Map();
	if (coverageForFiles === undefined) {
		return { filesCoverage, packageMethodCoverage: 100 };
	}
	let totalMethods = 0;
	let totalMethodsCovered = 0;
	for (const file of coverageForFiles) {
		const filePath = file.$.filename;
		const lineCoverage = Number.parseFloat(file.$["line-rate"]) * 100;
		const branchCoverage = Number.parseFloat(file.$["branch-rate"]) * 100;
		const methods = file.methods[0].method;
		const methodCoverage =
			methods !== undefined && methods.length > 0
				? (methods.reduce((acc, method) => {
						return acc + (Number.parseInt(method.$.hits, 10) > 0 ? 1 : 0);
					}, 0) /
						methods.length) *
					100
				: 100;
		totalMethods += methods?.length ?? 0;
		totalMethodsCovered += methods === undefined ? 0 : (methodCoverage / 100) * methods.length;
		filesCoverage.set(filePath, {
			lineCoverage,
			branchCoverage,
			methodCoverage,
		});
	}
	return { filesCoverage, packageMethodCoverage: (totalMethodsCovered / totalMethods) * 100 };
}

const extractCoverageMetrics = (
	xmlForCoverageReportFromArtifact: XmlCoverageReportSchema,
): Map<string, CoverageMetricForPackages> => {
	const report: Map<string, CoverageMetricForPackages> = new Map();
	const coverageForPackagesResult =
		xmlForCoverageReportFromArtifact.coverage.packages[0]?.package;

	for (const coverageForPackage of coverageForPackagesResult) {
		const packagePath = coverageForPackage.$.name;
		const lineCoverage = Number.parseFloat(coverageForPackage.$["line-rate"]) * 100;
		const branchCoverage = Number.parseFloat(coverageForPackage.$["branch-rate"]) * 100;
		const filesCoverage = extractCoverageForEachFiles(coverageForPackage.classes[0].class);
		if (
			packagePath &&
			!Number.isNaN(lineCoverage) &&
			!Number.isNaN(branchCoverage) &&
			!Number.isNaN(filesCoverage.packageMethodCoverage)
		) {
			report.set(packagePath, {
				lineCoverage,
				branchCoverage,
				methodCoverage: filesCoverage.packageMethodCoverage,
				filesCoverage: filesCoverage.filesCoverage,
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
): Promise<Map<string, CoverageMetricForPackages>> => {
	const coverageReportsFiles: string[] = [];
	// eslint-disable-next-line unicorn/no-array-for-each -- required as JSZip does not implement [Symbol.iterator]() which is required by for...of
	artifactZip.forEach((filePath) => {
		if (filePath.endsWith("cobertura-coverage-patched.xml"))
			coverageReportsFiles.push(filePath);
	});

	let coverageMetricsForBaseline: Map<string, CoverageMetricForPackages> = new Map();
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
