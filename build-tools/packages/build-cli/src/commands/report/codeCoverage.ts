/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { getCodeCoverageSummary } from "../../codeCoverage/codeCoveragePr.js";
import { createOrUpdateCommentOnPr, getChangedFilenames } from "../../library/githubRest.js";
import { BaseCommand, type IAzureDevopsBuildCoverageConstants } from "../../library/index.js";

// Unique identifier for the comment made on the PR. This is used to identify the comment
// and update it based on a new build.
const commentIdentifier = `<!-- Code coverage automated comment -->`;

export default class ReportCodeCoverageCommand extends BaseCommand<
	typeof ReportCodeCoverageCommand
> {
	static readonly description = "Run comparison of code coverage stats";

	static readonly flags = {
		ADO_BUILD_ID: Flags.integer({
			description: "Azure DevOps build ID.",
			env: "ADO_BUILD_ID",
			required: true,
		}),
		ADO_API_TOKEN: Flags.string({
			description: "Token to get auth for accessing ADO builds.",
			env: "ADO_API_TOKEN",
			required: true,
		}),
		GITHUB_API_TOKEN: Flags.string({
			description: "Token to get auth for accessing Github PR.",
			env: "GITHUB_API_TOKEN",
			required: true,
		}),
		ADO_CI_BUILD_DEFINITION_ID_BASELINE: Flags.integer({
			description: "Build definition/pipeline number/id for the baseline build.",
			env: "ADO_CI_BUILD_DEFINITION_ID_BASELINE",
			required: true,
		}),
		ADO_CI_BUILD_DEFINITION_ID_PR: Flags.integer({
			description: "Build definition/pipeline number/id for the PR build.",
			env: "ADO_CI_BUILD_DEFINITION_ID_PR",
			required: true,
		}),
		CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE: Flags.string({
			description: "Code coverage artifact name for the baseline build.",
			env: "CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE",
			required: true,
		}),
		CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR: Flags.string({
			description: "Code coverage artifact name for the PR build.",
			env: "CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR",
			required: true,
		}),
		GITHUB_PR_NUMBER: Flags.integer({
			description: "Github PR number.",
			env: "GITHUB_PR_NUMBER",
			required: true,
		}),
		GITHUB_REPOSITORY_NAME: Flags.string({
			description: "Github repository name.",
			env: "GITHUB_REPOSITORY_NAME",
			required: true,
		}),
		GITHUB_REPOSITORY_OWNER: Flags.string({
			description: "Github repository owner.",
			env: "GITHUB_REPOSITORY_OWNER",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		const codeCoverageConstantsForBaseline: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.ADO_CI_BUILD_DEFINITION_ID_BASELINE,
			artifactName: flags.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE,
			buildsToSearch: 50,
		};

		const codeCoverageConstantsForPR: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: flags.ADO_CI_BUILD_DEFINITION_ID_PR,
			artifactName: flags.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR,
			buildsToSearch: 50,
			buildId: flags.ADO_BUILD_ID,
		};

		// Get the names of the files that have changed in the PR. This is used to determine
		// which packages have been affect so that we can do code coverage analysis on those
		// packages only.
		const changesFiles = await getChangedFilenames(
			{
				owner: flags.GITHUB_REPOSITORY_OWNER,
				repo: flags.GITHUB_REPOSITORY_NAME,
				token: flags.GITHUB_API_TOKEN,
			},
			flags.GITHUB_PR_NUMBER,
		);

		const report = await getCodeCoverageSummary(
			flags.ADO_API_TOKEN,
			codeCoverageConstantsForBaseline,
			codeCoverageConstantsForPR,
			changesFiles,
			this.logger,
		);

		let messageContent = `${commentIdentifier}\n\n${report.commentMessage}`;
		if (report.failBuild) {
			messageContent = `${messageContent}\n\n<H2>Code coverage failed</H2>`;
		}

		await createOrUpdateCommentOnPr(
			{
				owner: flags.GITHUB_REPOSITORY_OWNER,
				repo: flags.GITHUB_REPOSITORY_NAME,
				token: flags.GITHUB_API_TOKEN,
			},
			flags.GITHUB_PR_NUMBER,
			messageContent,
			commentIdentifier,
		);

		// Fail the build if the code coverage analysis shows that a regression has been found.
		if (report.failBuild) {
			this.error("Code coverage failed", { exit: 255 });
		}
	}
}
