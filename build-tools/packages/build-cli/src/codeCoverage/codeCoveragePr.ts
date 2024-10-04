/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAzureDevopsApi } from "@fluidframework/bundle-size-tools";
import { type IAzureDevopsBuildCoverageConstants } from "../library/azureDevops/constants.js";
import {
	type IBuildMetrics,
	getBaselineBuildMetrics,
	getBuildArtifactForSpecificBuild,
} from "../library/azureDevops/getBaselineBuildMetrics.js";
import type { CommandLogger } from "../logging.js";
import { type CodeCoverageComparison, compareCodeCoverage } from "./compareCodeCoverage.js";
import { getCoverageMetricsFromArtifact } from "./getCoverageMetrics.js";

/**
 * Report of code coverage comparison.
 */
export interface CodeCoverageReport {
	/**
	 * Comparison data for each package.
	 */
	comparisonData: CodeCoverageComparison[];

	/**
	 * Baseline build metrics against which the PR build metrics are compared.
	 */
	baselineBuildMetrics: IBuildMetrics;
}

/**
 * API to get the code coverage report for a PR.
 * @param adoToken - ADO token that will be used to download artifacts from ADO pipeline runs.
 * @param codeCoverageConstantsBaseline - The code coverage constants required for fetching the baseline build artifacts.
 * @param codeCoverageConstantsPR - The code coverage constants required for fetching the PR build artifacts.
 * @param changedFiles - The list of files changed in the PR.
 * @param logger - The logger to log messages.
 */
export async function getCodeCoverageReport(
	adoToken: string,
	codeCoverageConstantsBaseline: IAzureDevopsBuildCoverageConstants,
	codeCoverageConstantsPR: IAzureDevopsBuildCoverageConstants,
	changedFiles: string[],
	logger?: CommandLogger,
): Promise<CodeCoverageReport> {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstantsBaseline.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
		codeCoverageConstantsBaseline,
		adoConnection,
		logger,
	).catch((error) => {
		logger?.errorLog(`Error getting baseline build metrics: ${error}`);
		throw error;
	});

	const adoConnectionForPR = getAzureDevopsApi(adoToken, codeCoverageConstantsPR.orgUrl);

	const prBuildInfo = await getBuildArtifactForSpecificBuild(
		codeCoverageConstantsPR,
		adoConnectionForPR,
		logger,
	).catch((error) => {
		logger?.errorLog(`Error getting PR build metrics: ${error}`);
		throw error;
	});

	// Extract the coverage metrics for the baseline and PR builds.
	const [coverageMetricsForBaseline, coverageMetricsForPr] = await Promise.all([
		getCoverageMetricsFromArtifact(baselineBuildInfo.artifactZip),
		getCoverageMetricsFromArtifact(prBuildInfo.artifactZip),
	]);

	// Compare the code coverage metrics for the baseline and PR builds.
	const comparisonData = compareCodeCoverage(
		coverageMetricsForBaseline,
		coverageMetricsForPr,
		changedFiles,
	);

	return {
		comparisonData,
		baselineBuildMetrics: baselineBuildInfo,
	};
}
