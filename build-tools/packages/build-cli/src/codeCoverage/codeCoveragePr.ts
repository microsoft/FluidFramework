/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAzureDevopsApi } from "@fluidframework/bundle-size-tools";
import { type IAzureDevopsBuildCoverageConstants } from "../library/azureDevops/constants.js";
import { getBaselineBuildMetrics } from "../library/azureDevops/getBaselineBuildMetrics.js";
import type { CommandLogger } from "../logging.js";
import { compareCodeCoverage } from "./compareCodeCoverage.js";
import { getCommentForCodeCoverageDiff } from "./getCommentForCodeCoverage.js";
import {
	getCoverageMetricsForBaseline,
	getCoverageMetricsForPr,
} from "./getCoverageMetrics.js";

/**
 * Interface that reflects the type of object returned by the coverage summary method
 */
export interface CodeCoverageSummary {
	/**
	 * Message to be put in the comment
	 */
	commentMessage: string;

	/**
	 * Whether to fail the build or not
	 */
	failBuild: boolean;
}

/**
 * Get the code coverage summary on the PRs
 * @param adoToken - ADO token
 * @param coverageReportsFolder - The path to where the "target" coverage reports (the ones to be compared against a baseline) exist.
 * @param codeCoverageConstants - The code coverage constants required for the code coverage analysis
 */
export const getCodeCoverageSummary = async (
	adoToken: string,
	coverageReportsFolder: string,
	codeCoverageConstants: IAzureDevopsBuildCoverageConstants,
	logger?: CommandLogger,
): Promise<CodeCoverageSummary> => {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstants.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
		"codeCoverage",
		codeCoverageConstants,
		adoConnection,
		logger,
	);

	if (baselineBuildInfo === undefined || typeof baselineBuildInfo === "string") {
		return {
			commentMessage: baselineBuildInfo ?? "No Baseline build found",
			failBuild: false,
		};
	}

	const [coverageMetricsForBaseline, coverageMetricsForPr] = await Promise.all([
		getCoverageMetricsForBaseline(baselineBuildInfo.baselineArtifactZip),
		getCoverageMetricsForPr(coverageReportsFolder),
	]);

	const codeCoverageComparison = compareCodeCoverage(
		coverageMetricsForBaseline,
		coverageMetricsForPr,
	);

	return getCommentForCodeCoverageDiff(codeCoverageComparison, baselineBuildInfo);
};
