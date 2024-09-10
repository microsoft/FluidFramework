/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { codeCoverageConstants } from "./ADO/codeCoverageConstants";
import { getAzureDevopsApi } from "./ADO/getAzureDevopsApi";
import { getBaselineBuildMetrics } from "./ADO/getBaselineBuildMetrics";
import type { CodeCoverageSummary } from "./codeCoverageCli";
import { compareCodeCoverage } from "./compareCodeCoverage";
import { getCommentForCodeCoverageDiff } from "./getCommentForCodeCoverage";
import { getCoverageMetricsForBaseline, getCoverageMetricsForPr } from "./getCoverageMetrics";

export type CoverageReport = {
	packageName: string;
	lineCoverage: number;
	branchCoverage: number;
};

/**
 * Post the code coverage summary on the PRs
 * @param adoToken ADO token
 * @param coverageReportsFolder The path to where the coverage reports exist
 */
export const postCodeCoverageSummary = async (
	adoToken: string,
	coverageReportsFolder: string,
): Promise<CodeCoverageSummary> => {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstants.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
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
