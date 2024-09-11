/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBaselineBuildMetrics } from "./ADO/getBaselineBuildMetrics.js";
import type { CodeCoverageSummary } from "./codeCoverageCli.js";
import type { CodeCoverageComparison } from "./compareCodeCoverage.js";

const codeCoverageDetailsHeader = `<table><tr><th>Metric Name</th><th>Baseline coverage</th><th>PR coverage</th><th>Coverage Diff</th></tr>`;

/**
 * Method that returns the comment to be posted on PRs about code coverage
 * @param codeCoverageComparisonReport - The comparison report between baseline and pr test coverage
 * @returns Comment to be posted on the PR, and whether the code coverage comparison check passed or not
 */
export const getCommentForCodeCoverageDiff = async (
	codeCoverageComparisonReport: CodeCoverageComparison[],
	baselineBuildInfo: IBaselineBuildMetrics,
): Promise<CodeCoverageSummary> => {
	// Find new packages that do not have test setup and are being impacted by changes in the PR
	const newPackagesIdentifiedByCodeCoverage = codeCoverageComparisonReport.filter(
		(codeCoverageReport) =>
			(codeCoverageReport.lineCoverageInPr === 0 &&
				codeCoverageReport.lineCoverageInBaseline === 0) ||
			codeCoverageReport.isNewPackage,
	);
	console.log(`Found ${newPackagesIdentifiedByCodeCoverage.length} new packages`);

	// Find existing packages that have reported a change in coverage for the current PR
	const existingPackagesWithCoverageChange = codeCoverageComparisonReport.filter(
		(codeCoverageReport) =>
			codeCoverageReport.branchCoverageDiff !== 0 || codeCoverageReport.lineCoverageDiff !== 0,
	);
	console.log(
		`Found ${existingPackagesWithCoverageChange.length} packages with code coverage changes`,
	);

	const packagesWithNotableRegressions = existingPackagesWithCoverageChange.filter(
		(codeCoverageReport: CodeCoverageComparison) =>
			codeCoverageReport.branchCoverageDiff < -1 || codeCoverageReport.lineCoverageDiff < -1,
	);

	// Code coverage for the newly added package should be less than 50% to fail the build
	const newPackagesWithNotableRegressions = newPackagesIdentifiedByCodeCoverage.filter(
		(codeCoverageReport) =>
			codeCoverageReport.branchCoverageInPr < 50 || codeCoverageReport.lineCoverageInPr < 50,
	);
	let failBuild: boolean = false;
	if (
		newPackagesWithNotableRegressions.length > 0 ||
		packagesWithNotableRegressions.length > 0
	) {
		failBuild = true;
	}

	const title = "## Code coverage summary";
	let coverageSummaryForImpactedPackages = "";
	let coverageSummaryForNewPackages = "";

	if (
		existingPackagesWithCoverageChange.length === 0 &&
		newPackagesIdentifiedByCodeCoverage.length === 0
	) {
		coverageSummaryForImpactedPackages = `No packages impacted by the change.`;
	}

	if (existingPackagesWithCoverageChange.length > 0) {
		coverageSummaryForImpactedPackages = getCodeCoverageSummary(
			existingPackagesWithCoverageChange,
		);
	}

	if (newPackagesIdentifiedByCodeCoverage.length > 0) {
		coverageSummaryForNewPackages = getCodeCoverageSummary(
			newPackagesIdentifiedByCodeCoverage,
		);
	}
	return {
		commentMessage: [
			title,
			coverageSummaryForImpactedPackages,
			coverageSummaryForNewPackages,
			getSummaryFooter(baselineBuildInfo),
		].join("\n\n"),
		failBuild,
	};
};

const getSummaryFooter = (baselineBuildInfo: IBaselineBuildMetrics): string => {
	return `<hr><p>Baseline commit: ${
		baselineBuildInfo.baselineCommit
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	} <br>Baseline build: <a target="_blank" href=${baselineBuildInfo.baselineBuild._links?.web.href as string}> ${
		baselineBuildInfo.baselineBuild.id
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

const formatDiff = (branchCoverageDiff: number): string => {
	if (branchCoverageDiff === 0) {
		return "No change";
	}
	return `${(branchCoverageDiff * 100).toFixed(2)}%`;
};

const getMetricRows = (codeCoverageComparisonReport: CodeCoverageComparison): string => {
	const glyphForLineCoverage = getColorGlyph(codeCoverageComparisonReport.lineCoverageDiff);
	const glyphForBranchCoverage = getColorGlyph(
		codeCoverageComparisonReport.branchCoverageDiff,
	);

	return (
		`<tr>
    <td>Branch Coverage</td>
    <td>${formatDiff(codeCoverageComparisonReport.branchCoverageInBaseline)}%</td>
    <td>${formatDiff(codeCoverageComparisonReport.branchCoverageInPr)}%</td>
    <td>${glyphForBranchCoverage} ${formatDiff(codeCoverageComparisonReport.branchCoverageDiff)}%</td>
  </tr>` +
		`<tr>
    <td>Line Coverage</td>
    <td>${formatDiff(codeCoverageComparisonReport.lineCoverageInBaseline)}%</td>
    <td>${formatDiff(codeCoverageComparisonReport.lineCoverageInPr)}%</td>
    <td>${glyphForLineCoverage} ${formatDiff(codeCoverageComparisonReport.lineCoverageDiff)}%</td>
    </tr>`
	);
};
