/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getCodeCoverageSummary } from "../../codeCoverage/codeCoveragePr.js";
import { createOrUpdateCommentOnPr, getChangedFilenames } from "../../library/githubRest.js";
import { BaseCommand, type IAzureDevopsBuildCoverageConstants } from "../../library/index.js";

// Unique identifier for the comment made on the PR. This is used to identify the comment
// and update it based on a new build.
const commentIdentifier = `## Code coverage summary`;

export default class ReportCodeCoverageCommand extends BaseCommand<typeof ReportCodeCoverageCommand> {
	static readonly description = "Run comparison of code coverage stats";

	static readonly flags = {
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		if (process.env.ADO_API_TOKEN === undefined) {
			throw new Error("ADO_API_TOKEN not provided in environment");
		}

		if (process.env.GITHUB_API_TOKEN === undefined) {
			throw new Error("GITHUB_API_TOKEN not provided in environment");
		}

		if (process.env.ADO_CI_BUILD_DEFINITION_ID_BASELINE === undefined) {
			throw new Error("ADO_CI_BUILD_DEFINITION_ID_BASELINE not provided in environment");
		}

		if (process.env.ADO_CI_BUILD_DEFINITION_ID_PR === undefined) {
			throw new Error("ADO_CI_BUILD_DEFINITION_ID_PR not provided in environment");
		}

		if (process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE === undefined) {
			throw new Error(
				"CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE not provided in environment",
			);
		}

		if (process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR === undefined) {
			throw new Error("CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR not provided in environment");
		}

		if (process.env.GITHUB_API_TOKEN === undefined) {
			throw new Error("GITHUB_API_TOKEN not provided in environment");
		}

		if (process.env.GITHUB_PR_NUMBER === undefined) {
			throw new Error("GITHUB_PR_NUMBER not provided in environment");
		}

		if (process.env.GITHUB_REPOSITORY_NAME === undefined) {
			throw new Error("GITHUB_REPOSITORY_NAME not provided in environment");
		}

		if (process.env.GITHUB_REPOSITORY_OWNER === undefined) {
			throw new Error("GITHUB_REPOSITORY_OWNER not provided in environment");
		}

		if (process.env.ADO_BUILD_ID === undefined) {
			throw new Error("ADO_BUILD_ID not provided in environment");
		}

		const codeCoverageConstantsForBaseline: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: Number.parseInt(
				process.env.ADO_CI_BUILD_DEFINITION_ID_BASELINE,
				10,
			),
			artifactName: process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE,
			buildsToSearch: 70,
		};

		const codeCoverageConstantsForPR: IAzureDevopsBuildCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: Number.parseInt(process.env.ADO_CI_BUILD_DEFINITION_ID_PR, 10),
			artifactName: process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR,
			buildsToSearch: 70,
			buildId: Number.parseInt(process.env.ADO_BUILD_ID, 10),
		};

		// Get the names of the files that have changed in the PR. This is used to determine
		// which packages have been affect so that we can do code coverage analysis on those
		// packages only.
		const changesFiles = await getChangedFilenames(
			{
				owner: process.env.GITHUB_REPOSITORY_OWNER,
				repo: process.env.GITHUB_REPOSITORY_NAME,
				token: process.env.GITHUB_API_TOKEN,
			},
			Number.parseInt(process.env.GITHUB_PR_NUMBER, 10),
		);

		const report = await getCodeCoverageSummary(
			process.env.ADO_API_TOKEN,
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
				owner: process.env.GITHUB_REPOSITORY_OWNER,
				repo: process.env.GITHUB_REPOSITORY_NAME,
				token: process.env.GITHUB_API_TOKEN,
			},
			Number.parseInt(process.env.GITHUB_PR_NUMBER, 10),
			messageContent,
			commentIdentifier,
		);

		// Fail the build if the code coverage analysis shows that a regression has been found.
		if (report.failBuild) {
			throw new Error("Code coverage failed");
		}
	}
}
