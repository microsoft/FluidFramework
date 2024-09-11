/* eslint-disable import/no-internal-modules */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IADOCodeCoverageConstants } from "./ADO/constants.js";
import { getAzureDevopsApi } from "./ADO/getAzureDevopsApi.js";
import { getBaselineBuildMetrics } from "./ADO/getBaselineBuildMetrics.js";
import type { CodeCoverageSummary } from "./codeCoverageCli.js";
import { compareCodeCoverage } from "./compareCodeCoverage.js";
import { getCommentForCodeCoverageDiff } from "./getCommentForCodeCoverage.js";
import {
	getCoverageMetricsForBaseline,
	getCoverageMetricsForPr,
} from "./getCoverageMetrics.js";

export interface CoverageReport {
	packageName: string;
	lineCoverage: number;
	branchCoverage: number;
}

/**
 * Post the code coverage summary on the PRs
 * @param adoToken - ADO token
 * @param coverageReportsFolder - The path to where the coverage reports exist
 * @param codeCoverageConstants - The code coverage constants required for the code coverage analysis
 */
export const postCodeCoverageSummary = async (
	adoToken: string,
	coverageReportsFolder: string,
	codeCoverageConstants: IADOCodeCoverageConstants,
): Promise<CodeCoverageSummary> => {
	const adoConnection = getAzureDevopsApi(adoToken, codeCoverageConstants.orgUrl);

	const baselineBuildInfo = await getBaselineBuildMetrics(
		"codeCoverage",
		codeCoverageConstants,
		adoConnection,
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
