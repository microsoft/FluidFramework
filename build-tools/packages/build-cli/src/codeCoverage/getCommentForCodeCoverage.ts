/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBuildMetrics } from "../library/azureDevops/getBaselineBuildMetrics.js";
import type {
	CodeCoverageChangeForPackages,
	CodeCoverageComparison,
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
	codeCoverageComparisonReport: CodeCoverageComparison[],
): string => {
	const summary = codeCoverageComparisonReport
		.sort(
			(report1, report2) =>
				// Sort the diff summary of packages based on the total coverage diff(line coverage + branch coverage)
				report1.branchCoverageDiff +
				report1.lineCoverageDiff -
				(report2.branchCoverageDiff + report2.lineCoverageDiff),
		)
		.map((coverageReport) => getCodeCoverageSummaryForPackages(coverageReport))
		.reduce((prev, current) => prev + current);

	return summary;
};

const getCodeCoverageSummaryForPackages = (coverageReport: CodeCoverageComparison): string => {
	const metrics = codeCoverageDetailsHeader + getMetricRows(coverageReport);

	return `<details><summary><b>${getGlyphForHtml(coverageReport.branchCoverageDiff + coverageReport.lineCoverageDiff)} ${
		coverageReport.packagePath
	}:</b> <br> Line Coverage Change: ${formatDiff(coverageReport.lineCoverageDiff)}&nbsp;&nbsp;&nbsp;&nbsp;Branch Coverage Change: ${formatDiff(
		coverageReport.branchCoverageDiff,
	)}</summary>${metrics}</table></details>`;
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
	const glyphForLineCoverage = getGlyphForHtml(codeCoverageComparisonReport.lineCoverageDiff);
	const glyphForBranchCoverage = getGlyphForHtml(
		codeCoverageComparisonReport.branchCoverageDiff,
	);

	return (
		`<tr>
    <td>Branch Coverage</td>
    <td>${codeCoverageComparisonReport.branchCoverageInBaseline.toFixed(2)}%</td>
    <td>${codeCoverageComparisonReport.branchCoverageInPr.toFixed(2)}%</td>
    <td>${glyphForBranchCoverage} ${formatDiff(codeCoverageComparisonReport.branchCoverageDiff)}</td>
  </tr>` +
		`<tr>
    <td>Line Coverage</td>
    <td>${codeCoverageComparisonReport.lineCoverageInBaseline.toFixed(2)}%</td>
    <td>${codeCoverageComparisonReport.lineCoverageInPr.toFixed(2)}%</td>
    <td>${glyphForLineCoverage} ${formatDiff(codeCoverageComparisonReport.lineCoverageDiff)}</td>
    </tr>`
	);
};
