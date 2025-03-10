/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBuildMetrics } from "../library/azureDevops/getBaselineBuildMetrics.js";
import type {
	CodeCoverageChangeForPackages,
	CodeCoverageComparison,
	CodeCoverageComparisonForPackages,
} from "./compareCodeCoverage.js";

const codeCoverageDetailsHeader = `<table><tr><th>Metric Name</th><th>Baseline coverage</th><th>PR coverage</th><th>Coverage Diff</th></tr>`;

/**
 * Method that returns the comment to be posted on PRs about code coverage
 * @param packagesListWithCodeCoverageChanges - The comparison data for packages with code coverage changes.
 * @param baselineBuildInfo - The baseline build information.
 * @param success - Flag to indicate if the code coverage comparison check passed or not
 * @returns Comment to be posted on the PR, and whether the code coverage comparison check passed or not
 */
export function getCommentForCodeCoverageDiff(
	packagesListWithCodeCoverageChanges: CodeCoverageChangeForPackages,
	baselineBuildInfo: IBuildMetrics,
	success: boolean,
): string {
	const { codeCoverageComparisonForNewPackages, codeCoverageComparisonForExistingPackages } =
		packagesListWithCodeCoverageChanges;

	let coverageSummaryForImpactedPackages = "";
	let coverageSummaryForNewPackages = "";

	if (
		codeCoverageComparisonForExistingPackages.length === 0 &&
		codeCoverageComparisonForNewPackages.length === 0
	) {
		coverageSummaryForImpactedPackages = `No packages impacted by the change.`;
	}

	if (codeCoverageComparisonForExistingPackages.length > 0) {
		coverageSummaryForImpactedPackages = getCodeCoverageSummary(
			codeCoverageComparisonForExistingPackages,
		);
	}

	if (codeCoverageComparisonForNewPackages.length > 0) {
		coverageSummaryForNewPackages = getCodeCoverageSummary(
			codeCoverageComparisonForNewPackages,
		);
	}
	return [
		"## Code Coverage Summary",
		coverageSummaryForImpactedPackages,
		coverageSummaryForNewPackages,
		getSummaryFooter(baselineBuildInfo),
		success
			? "### Code coverage comparison check passed!!"
			: "### Code coverage comparison check failed!!<br>More Details: [Readme](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/codeCoverageDetails.md#success-criteria)",
	].join("\n\n");
}

const getSummaryFooter = (baselineBuildInfo: IBuildMetrics): string => {
	return `<hr><p>Baseline commit: ${
		baselineBuildInfo.build.sourceVersion
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	} <br>Baseline build: <a target="_blank" href=${baselineBuildInfo.build._links?.web.href as string}> ${
		baselineBuildInfo.build.id
	} </a><br> Happy Coding!!</p>`;
};

const getCodeCoverageSummary = (
	codeCoverageComparisonReport: CodeCoverageComparisonForPackages[],
): string => {
	const summary = codeCoverageComparisonReport
		.sort(
			(report1, report2) =>
				// Sort the diff summary of packages based on the total coverage diff(branch + method coverage)
				report1.branchCoverageDiff +
				report1.methodCoverageDiff -
				(report2.branchCoverageDiff + report2.methodCoverageDiff),
		)
		.map((coverageReport) => getCodeCoverageSummaryForPackages(coverageReport))
		.reduce((prev, current) => prev + current);

	return summary;
};

const getCodeCoverageSummaryForPackages = (
	coverageReport: CodeCoverageComparisonForPackages,
): string => {
	const metrics = codeCoverageDetailsHeader + getMetricRows(coverageReport);

	return `<details><summary><b>${getGlyphForHtml(coverageReport.branchCoverageDiff + coverageReport.methodCoverageDiff)} ${
		coverageReport.path
	}:</b> <br> &nbsp;Branch Coverage Change: ${formatDiff(
		coverageReport.branchCoverageDiff,
	)} &nbsp;Method Coverage Change: ${formatDiff(
		coverageReport.methodCoverageDiff,
	)}</summary>${metrics}</table><b>Files Details:</b>&Tab;${getCodeCoverageSummaryForFiles(coverageReport.filesCoverageComparison)}</details>`;
};

const getCodeCoverageSummaryForFiles = (coverageReport: CodeCoverageComparison[]): string => {
	let summary = "";
	for (const fileCoverageReport of coverageReport) {
		const fileMetrics = codeCoverageDetailsHeader + getMetricRows(fileCoverageReport);

		const filesSummary = `<details><summary><b>${getGlyphForHtml(
			fileCoverageReport.branchCoverageDiff + fileCoverageReport.methodCoverageDiff,
		)} ${fileCoverageReport.path}:</b> <br> &nbsp;Branch Coverage Change: ${formatDiff(
			fileCoverageReport.branchCoverageDiff,
		)} &nbsp;Method Coverage Change: ${formatDiff(
			fileCoverageReport.methodCoverageDiff,
		)}</summary>${fileMetrics}</table></details>`;
		summary += filesSummary;
	}
	return summary;
};
const getGlyphForHtml = (codeCoverageDiff: number): string => {
	if (codeCoverageDiff === 0) {
		return "&rarr;";
	}

	if (codeCoverageDiff > 0) {
		return "&uarr;";
	}

	return "&darr;";
};

const formatDiff = (coverageDiff: number): string => {
	if (coverageDiff === 0) {
		return "No change";
	}
	return `${coverageDiff.toFixed(2)}%`;
};

const getMetricRows = (codeCoverageComparisonReport: CodeCoverageComparison): string => {
	const glyphForBranchCoverage = getGlyphForHtml(
		codeCoverageComparisonReport.branchCoverageDiff,
	);

	const glyphForMethodCoverage = getGlyphForHtml(
		codeCoverageComparisonReport.methodCoverageDiff,
	);

	return (
		`<tr>
    <td>Branch Coverage</td>
    <td>${codeCoverageComparisonReport.branchCoverageInBaseline.toFixed(2)}%</td>
    <td>${codeCoverageComparisonReport.branchCoverageInPr.toFixed(2)}%</td>
    <td>${glyphForBranchCoverage} ${formatDiff(codeCoverageComparisonReport.branchCoverageDiff)}</td>
  </tr>` +
		`<tr>
    <td>Method Coverage</td>
    <td>${codeCoverageComparisonReport.methodCoverageInBaseline.toFixed(2)}%</td>
    <td>${codeCoverageComparisonReport.methodCoverageInPr.toFixed(2)}%</td>
    <td>${glyphForMethodCoverage} ${formatDiff(codeCoverageComparisonReport.methodCoverageDiff)}</td>
  </tr>`
	);
};
