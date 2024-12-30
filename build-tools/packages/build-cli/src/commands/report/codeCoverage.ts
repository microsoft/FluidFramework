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
		githubPRNumber: Flags.integer({
			description: "Github PR number.",
			env: "GITHUB_PR_NUMBER",
			required: true,
		}),
		githubRepositoryName: Flags.string({
			description:
				"Github repository name. It should be in this format: <org_or_owner>/<name>. For example: microsoft/FluidFramework",
			env: "GITHUB_REPOSITORY_NAME",
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

		const artifactNamePrefix = "Code Coverage Report";
		const codeCoverageConstantsForBaseline: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.adoCIBuildDefinitionIdBaseline,
			artifactName: artifactNamePrefix,
			branch: flags.targetBranchName,
			buildsToSearch: 50,
		};

		const codeCoverageConstantsForPR: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.adoCIBuildDefinitionIdPR,
			artifactName: artifactNamePrefix,
			buildsToSearch: 20,
			buildId: flags.adoBuildId,
		};

		const repoInfo = flags.githubRepositoryName.split("/");
		if (repoInfo.length !== 2) {
			this.errorLog("Invalid github repository name");
			return;
		}
		const githubProps: GitHubProps = {
			owner: repoInfo[0],
			repo: repoInfo[1],
			token: flags.githubApiToken,
		};

		let shouldFailBuildOnRegression = true;
		// Don't fail if we can not compare the code coverage due to an error.
		let success: boolean = true;
		// If any error occurs while getting the code coverage metrics, we will log the error and return.
		// We don't want this check to throw and potentially cause build failures as that would be error in this
		// command and not in the PR. If we see no comments getting posted on the PR because of this, then we can
		// investigate the command and fix it.
		try {
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
					shouldFailBuildOnRegression = !(match[1].toLowerCase() === "x");
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
			});

			if (report !== undefined) {
				const packagesListWithCodeCoverageChanges = getPackagesWithCodeCoverageChanges(
					report.comparisonData,
					this.logger,
				);

				success = isCodeCoverageCriteriaPassed(
					packagesListWithCodeCoverageChanges,
					this.logger,
				);

				commentMessage = getCommentForCodeCoverageDiff(
					packagesListWithCodeCoverageChanges,
					report.baselineBuildMetrics,
					success,
				);
			}

			let messageContentWithIdentifier = `${commentIdentifier}\n\n${commentMessage}`;

			if (!success) {
				messageContentWithIdentifier = shouldFailBuildOnRegression
					? `${messageContentWithIdentifier}\n\n- [ ] Skip This Check!!`
					: `${messageContentWithIdentifier}\n\n- [x] Skip This Check!!`;

				messageContentWithIdentifier = `${messageContentWithIdentifier}\n${summaryFooterOnFailure}`;
			}

			await createOrUpdateCommentOnPr(
				githubProps,
				flags.githubPRNumber,
				messageContentWithIdentifier,
				commentIdentifier,
			);
		} catch (error) {
			this.errorLog(`Error in code coverage check: ${error}`);
			return;
		}
		// Fail the build if the code coverage analysis shows that a regression has been found.
		if (!success && shouldFailBuildOnRegression) {
			this.error("Code coverage failed", { exit: 255 });
		}
	}
}

const summaryFooterOnFailure =
	"### What to do if the code coverage check fails:\n" +
	"- Ideally, add more tests to increase the code coverage for the package(s) whose code-coverage regressed. Currently, we are only checking branch coverage for the code coverage check.\n" +
	"- If a regression is causing the build to fail and is due to removal of tests, removal of code with lots of tests or any other valid reason, there is a checkbox further up in this comment that determines if the code coverage check should fail the build or not. You can check the box and trigger the build again. The test coverage analysis will still be done, but it will not fail the build if a regression is detected.\n" +
	"- Unchecking the checkbox and triggering another build should go back to failing the build if a test-coverage regression is detected.\n\n" +
	"- You can check which lines are covered or not covered by your tests with these steps:\n" +
	"  - Go to the PR ADO build.\n" +
	"  - Click on the link to see its published artifacts. You will see an artifact named `codeCoverageAnalysis`, which you can expand to reach to a particular source file's coverage html which will show which lines are covered/not covered by your tests.\n" +
	"  - You can also run different kind of tests locally with `:coverage` tests commands to find out the coverage.\n";
