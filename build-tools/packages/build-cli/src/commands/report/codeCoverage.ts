/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { getCodeCoverageReport } from "../../codeCoverage/codeCoveragePr.js";
import {
	getPackagesWithCodeCoverageChanges,
	isCodeCoverageCriteriaPassed,
} from "../../codeCoverage/compareCodeCoverage.js";
import { getCommentForCodeCoverageDiff } from "../../codeCoverage/getCommentForCodeCoverage.js";
import { type IAzureDevopsBuildCoverageConstants } from "../../library/azureDevops/constants.js";
import {
	type GitHubProps,
	createOrUpdateCommentOnPr,
	getChangedFilePaths,
	getCommentBody,
} from "../../library/githubRest.js";
import { BaseCommand } from "../../library/index.js";

// Unique identifier for the comment made on the PR. This is used to identify the comment
// and update it based on a new build.
const commentIdentifier = `<!-- Code coverage automated comment -->`;

export default class ReportCodeCoverageCommand extends BaseCommand<
	typeof ReportCodeCoverageCommand
> {
	static readonly description = "Run comparison of code coverage stats";

	static readonly flags = {
		adoBuildId: Flags.integer({
			description: "Azure DevOps build ID.",
			env: "ADO_BUILD_ID",
			required: true,
		}),
		adoApiToken: Flags.string({
			description: "Token to get auth for accessing ADO builds.",
			env: "ADO_API_TOKEN",
			required: true,
		}),
		githubApiToken: Flags.string({
			description: "Token to get auth for accessing Github PR.",
			env: "GITHUB_API_TOKEN",
			required: true,
		}),
		adoCIBuildDefinitionIdBaseline: Flags.integer({
			description: "Build definition/pipeline number/id for the baseline build.",
			env: "ADO_CI_BUILD_DEFINITION_ID_BASELINE",
			required: true,
		}),
		adoCIBuildDefinitionIdPR: Flags.integer({
			description: "Build definition/pipeline number/id for the PR build.",
			env: "ADO_CI_BUILD_DEFINITION_ID_PR",
			required: true,
		}),
		codeCoverageAnalysisArtifactNameBaseline: Flags.string({
			description: "Code coverage artifact name for the baseline build.",
			env: "CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE",
			required: false,
		}),
		codeCoverageAnalysisArtifactNamePR: Flags.string({
			description: "Code coverage artifact name for the PR build.",
			env: "CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR",
			required: false,
		}),
		githubPRNumber: Flags.integer({
			description: "Github PR number.",
			env: "GITHUB_PR_NUMBER",
			required: true,
		}),
		githubRepositoryName: Flags.string({
			description: "Github repository name.",
			env: "GITHUB_REPOSITORY_NAME",
			required: true,
		}),
		githubRepositoryOwner: Flags.string({
			description: "Github repository owner.",
			env: "GITHUB_REPOSITORY_OWNER",
			required: true,
		}),
		targetBranchName: Flags.string({
			description: "Target branch name.",
			env: "TARGET_BRANCH_NAME",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		const codeCoverageConstantsForBaseline: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.adoCIBuildDefinitionIdBaseline,
			artifactName: flags.codeCoverageAnalysisArtifactNameBaseline ?? "Code Coverage Report",
			branch: flags.targetBranchName,
			buildsToSearch: 50,
		};

		const codeCoverageConstantsForPR: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.adoCIBuildDefinitionIdPR,
			artifactName: flags.codeCoverageAnalysisArtifactNamePR ?? "Code Coverage Report",
			buildsToSearch: 20,
			buildId: flags.adoBuildId,
		};

		const githubProps: GitHubProps = {
			owner: flags.githubRepositoryOwner,
			repo: flags.githubRepositoryName,
			token: flags.githubApiToken,
		};

		let skipBuildFailureOnRegression = false;
		const commentBody = await getCommentBody(
			githubProps,
			flags.githubPRNumber,
			commentIdentifier,
		);
		if (commentBody !== undefined) {
			// Use a regular expression to find the checkbox in the comment body
			const checkboxRegex = /- \[([ Xx])]/;
			const match = checkboxRegex.exec(commentBody);

			if (match !== null) {
				// If the checkbox is checked, the match will be 'x' or 'X'
				skipBuildFailureOnRegression = match[1].toLowerCase() === "x";
			}
		}

		// Get the paths of the files that have changed in the PR relative to root of the repo.
		// This is used to determine which packages have been affect so that we can do code coverage
		// analysis on those packages only.
		const changedFiles = await getChangedFilePaths(githubProps, flags.githubPRNumber);

		let commentMessage: string = "";
		const report = await getCodeCoverageReport(
			flags.adoApiToken,
			codeCoverageConstantsForBaseline,
			codeCoverageConstantsForPR,
			changedFiles,
			this.logger,
		).catch((error: Error) => {
			commentMessage = "## Code Coverage Summary\n\nError getting code coverage report";
			this.logger.errorLog(`Error getting code coverage report: ${error}`);
			return undefined;
		});

		// Don't fail if we can not compare the code coverage due to an error.
		let success: boolean = true;
		if (report !== undefined) {
			const packagesListWithCodeCoverageChanges = getPackagesWithCodeCoverageChanges(
				report.comparisonData,
				this.logger,
			);

			success = isCodeCoverageCriteriaPassed(packagesListWithCodeCoverageChanges, this.logger);

			commentMessage = getCommentForCodeCoverageDiff(
				packagesListWithCodeCoverageChanges,
				report.baselineBuildMetrics,
				success,
			);
		}

		let messageContentWithIdentifier = `${commentIdentifier}\n\n${commentMessage}`;

		if (!success) {
			messageContentWithIdentifier = skipBuildFailureOnRegression
				? `${messageContentWithIdentifier}\n\n- [x] Check is skipped! If you want to re-run this test again and allow build failure on regression, please uncheck this box and trigger build again.`
				: `${messageContentWithIdentifier}\n\n- [ ] Skip This Check!! If the regression is due to removal of tests, removal of code with lots of tests or any other valid reason, please tick the checkbox and trigger the build again.`;
		}

		await createOrUpdateCommentOnPr(
			githubProps,
			flags.githubPRNumber,
			messageContentWithIdentifier,
			commentIdentifier,
		);

		// Fail the build if the code coverage analysis shows that a regression has been found.
		if (!(success || skipBuildFailureOnRegression)) {
			this.error("Code coverage failed", { exit: 255 });
		}
	}
}
