/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAzureDevopsApi } from "@fluidframework/bundle-size-tools";
import { type IAzureDevopsBuildCoverageConstants } from "../library/azureDevops/constants.js";
import {
	getBaselineBuildMetrics,
	getBuildArtifactForSpecificBuild,
} from "../library/azureDevops/getBaselineBuildMetrics.js";
import type { CommandLogger } from "../logging.js";
import { compareCodeCoverage } from "./compareCodeCoverage.js";
import { getCommentForCodeCoverageDiff } from "./getCommentForCodeCoverage.js";
import { getCoverageMetricsForBaseline } from "./getCoverageMetrics.js";

/**
 * Summary of code coverage analysis.
 */
export interface CodeCoverageSummary {
	/**
	 * Message to be put in the comment.
	 */
	commentMessage: string;

	/**
	 * Whether to fail the build or not.
	 */
	failBuild: boolean;
}

/**
 * API to get the code coverage summary for a PR.
 * @param adoToken - ADO token that will be used to download artifacts from ADO pipeline runs.
 * @param codeCoverageConstantsBaseline - The code coverage constants required for fetching the baseline build artifacts.
 * @param codeCoverageConstantsPR - The code coverage constants required for fetching the PR build artifacts.
 * @param changedFiles - The list of files changed in the PR.
 * @param logger - The logger to log messages.
 */
export const getCodeCoverageSummary = async (
	adoToken: string,
	codeCoverageConstantsBaseline: IAzureDevopsBuildCoverageConstants,
	codeCoverageConstantsPR: IAzureDevopsBuildCoverageConstants,
	changedFiles: string[],
	logger?: CommandLogger,
): Promise<CodeCoverageSummary> => {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstantsBaseline.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
		codeCoverageConstantsBaseline,
		adoConnection,
		logger,
	);

	if (baselineBuildInfo === undefined || typeof baselineBuildInfo === "string") {
		return {
			commentMessage: baselineBuildInfo ?? "No Baseline build found",
			failBuild: false,
		};
	}

	const adoConnectionForPR = getAzureDevopsApi(adoToken, codeCoverageConstantsPR.orgUrl);

	const prBuildInfo = await getBuildArtifactForSpecificBuild(
		codeCoverageConstantsPR,
		adoConnectionForPR,
		logger,
	);

	if (prBuildInfo === undefined || typeof prBuildInfo === "string") {
		return {
			commentMessage: prBuildInfo ?? "No PR build found",
			failBuild: false,
		};
	}

	// Extract the coverage metrics for the baseline and PR builds.
	const [coverageMetricsForBaseline, coverageMetricsForPr] = await Promise.all([
		getCoverageMetricsForBaseline(baselineBuildInfo.artifactZip),
		getCoverageMetricsForBaseline(prBuildInfo.artifactZip),
	]);

	// Compare the code coverage metrics for the baseline and PR builds.
	const codeCoverageComparison = compareCodeCoverage(
		coverageMetricsForBaseline,
		coverageMetricsForPr,
		changedFiles,
	);

	// Get the comment for the code coverage diff.
	return getCommentForCodeCoverageDiff(codeCoverageComparison, baselineBuildInfo);
};
