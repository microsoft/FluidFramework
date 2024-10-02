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
			: "### Code coverage comparison check failed!!",
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
		.sort((report1, report2) => report1.branchCoverageDiff - report2.branchCoverageDiff)
		.map((coverageReport) => getCodeCoverageSummaryForPackages(coverageReport))
		.reduce((prev, current) => prev + current);

	return summary;
};

const getCodeCoverageSummaryForPackages = (coverageReport: CodeCoverageComparison): string => {
	const metrics = codeCoverageDetailsHeader + getMetricRows(coverageReport);

	return `<details><summary><b>${getColorGlyph(coverageReport.branchCoverageDiff)} ${
		coverageReport.packagePath
	}:</b> ${formatDiff(coverageReport.branchCoverageDiff)}</summary>${metrics}</table></details>`;
};

const getColorGlyph = (codeCoverageBranchDiff: number): string => {
	if (codeCoverageBranchDiff === 0) {
		return '<span style="color: green">■</span>';
	}

	if (codeCoverageBranchDiff > 0) {
		return '<span style="color: green">⯅</span>';
	}

	return '<span style="color: red">⯆</span>';
};

const formatDiff = (coverageDiff: number): string => {
	if (coverageDiff === 0) {
		return "No change";
	}
	return `${coverageDiff.toFixed(2)}%`;
};

const getMetricRows = (codeCoverageComparisonReport: CodeCoverageComparison): string => {
	const glyphForLineCoverage = getColorGlyph(codeCoverageComparisonReport.lineCoverageDiff);
	const glyphForBranchCoverage = getColorGlyph(
		codeCoverageComparisonReport.branchCoverageDiff,
	);

	return (
		`<tr>
    <td>Branch Coverage</td>
    <td>${formatDiff(codeCoverageComparisonReport.branchCoverageInBaseline)}</td>
    <td>${formatDiff(codeCoverageComparisonReport.branchCoverageInPr)}</td>
    <td>${glyphForBranchCoverage} ${formatDiff(codeCoverageComparisonReport.branchCoverageDiff)}</td>
  </tr>` +
		`<tr>
    <td>Line Coverage</td>
    <td>${formatDiff(codeCoverageComparisonReport.lineCoverageInBaseline)}</td>
    <td>${formatDiff(codeCoverageComparisonReport.lineCoverageInPr)}</td>
    <td>${glyphForLineCoverage} ${formatDiff(codeCoverageComparisonReport.lineCoverageDiff)}</td>
    </tr>`
	);
};
