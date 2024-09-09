/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareCodeCoverage } from "./compareCodeCoverage";
import { getCoverageMetricsForBaseline, getCoverageMetricsForPr } from "./getCoverageMetrics";
import { getBaselineBuildMetrics } from "./ADO/getBaselineBuildMetrics";
import { getAzureDevopsApi } from "./ADO/getAzureDevopsApi";
import { getCommentForCodeCoverageDiff } from "./getCommentForCodeCoverage";
import { codeCoverageConstants } from "./ADO/codeCoverageConstants";
import type { CodeCoverageSummary } from "./codeCoverageCli";

export type CoverageReport = {
	packageName: string;
	lineCoverage: number;
	branchCoverage: number;
};

/**
 * Post the code coverage summary on the PRs
 * @param adoToken ADO token
 * @param adoPrId Pr ID for which we are running code coverage
 * @param adoBuildId Build Id for the PR for which we are running code coverage
 * @param coverageReportsFolder The path to where the coverage reports exist
 */
export const postCodeCoverageSummary = async (
	adoToken: string,
	adoPrId: number,
	adoBuildId: number,
	coverageReportsFolder: string,
): Promise<CodeCoverageSummary> => {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstants.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
		adoBuildId,
		"codeCoverage",
		codeCoverageConstants.codeCoverageAnalysisArtifactName,
		adoConnection,
	);

	if (!baselineBuildInfo || typeof baselineBuildInfo === "string") {
		return {
			commentMessage:
				baselineBuildInfo === undefined ? "No Baseline build found" : baselineBuildInfo,
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

	return getCommentForCodeCoverageDiff(codeCoverageComparison);
};
