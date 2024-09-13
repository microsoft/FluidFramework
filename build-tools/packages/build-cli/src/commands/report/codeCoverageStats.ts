/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getCodeCoverageSummary } from "../../codeCoverage/codeCoveragePr.js";
import { createOrUpdateCommentOnPr } from "../../library/githubRest.js";
import { BaseCommand } from "../../library/index.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localCodeCoverageReportPath = "./nyc/report";
// Unique identifier for the comment
const commentIdentifier = `## Code coverage summary`;

export default class RunCodeCoverageStats extends BaseCommand<typeof RunCodeCoverageStats> {
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

		if (process.env.ADO_CI_BUILD_DEFINITION_ID === undefined) {
			throw new Error("ADO_CI_BUILD_DEFINITION_ID not provided in environment");
		}

		if (process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME === undefined) {
			throw new Error("CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME not provided in environment");
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

		const codeCoverageConstants = {
			orgUrl: "https://dev.azure.com/fluidframework",
			projectName: "public",
			ciBuildDefinitionId: Number.parseInt(process.env.ADO_CI_BUILD_DEFINITION_ID, 10),
			artifactName: process.env.CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME,
			buildsToSearch: 50,
		};

		const report = await getCodeCoverageSummary(
			process.env.ADO_API_TOKEN,
			localCodeCoverageReportPath,
			codeCoverageConstants,
		);

		let messageContent = `${commentIdentifier}\n\n${report.commentMessage}`;
		if (report.failBuild) {
			messageContent = `${messageContent}\n\nCode coverage failed`;
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

		if (report.failBuild) {
			throw new Error("Code coverage failed");
		}
	}
}
