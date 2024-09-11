/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Handle weirdness with Danger import.  The current module setup prevents us
// from using this file directly, and the js transpilation renames the danger
// import which prevents danger from removing it before evaluation (because it
// actually puts its exports in the global namespace at that time)
declare function fail(message: string, file?: string, line?: number): void;

declare const danger: {
	github: {
		utils: {
			createOrAddLabel: (
				labelConfig: { color: string; description: string; name: string },
				repoConfig?: { owner: string; repo: string; id: number },
			) => Promise<void>;
		};
		api: {
			issues: {
				createComment: (params: {
					owner: string;
					repo: string;
					issue_number: number;
					body: string;
				}) => Promise<void>;
				updateComment: (params: {
					owner: string;
					repo: string;
					comment_id: number;
					body: string;
				}) => Promise<void>;
				listComments: (params: {
					owner: string;
					repo: string;
					issue_number: number;
				}) => Promise<{ data: { id: number; body: string }[] }>;
			};
		};
		thisPR: {
			owner: string;
			repo: string;
			number: number;
		};
	};
};

const localCodeCoverageReportPath = "./nyc/report";

// Unique identifier for the comment
const commentIdentifier = "<!-- DANGER_TASK_1_For_Code_Coverage_Analysis-->";

export async function codeCoverageCompare(): Promise<void> {
	// const imp = await import("../codeCoverageAnalysisTool/index.js");
	if (process.env.ADO_API_TOKEN === undefined) {
		throw new Error("no env ado api token provided");
	}

	if (process.env.DANGER_GITHUB_API_TOKEN === undefined) {
		throw new Error("DANGER_GITHUB_API_TOKEN not provided in environment");
	}

	const codeCoverageConstants = {
		orgUrl: "https://dev.azure.com/fluidframework",
		projectName: "public",
		ciBuildDefinitionId: 48,
		projectRepoGuid: "203843667",
		codeCoverageAnalysisArtifactName: "codeCoverageAnalysis",
		buildsToSearch: 50,
	};
	const { codeCoverageCli } = await import("../codeCoverageAnalysisTool/codeCoverageCli.js");
	const report = await codeCoverageCli(
		process.env.ADO_API_TOKEN,
		localCodeCoverageReportPath,
		codeCoverageConstants,
	);
	if (report.failBuild) {
		fail(`Code coverage failed: ${report.commentMessage}`);
	}
	const messageContent = `${commentIdentifier}\n${report.commentMessage}`;
	const comments = await danger.github.api.issues.listComments({
		owner: danger.github.thisPR.owner,
		repo: danger.github.thisPR.repo,
		issue_number: danger.github.thisPR.number,
	});

	// Find the comment with the unique identifier
	const comment = comments.data.find((c) => c.body.includes(commentIdentifier));

	// eslint-disable-next-line unicorn/prefer-ternary
	if (comment === undefined) {
		// Create a new comment if not found
		await danger.github.api.issues.createComment({
			owner: danger.github.thisPR.owner,
			repo: danger.github.thisPR.repo,
			issue_number: danger.github.thisPR.number,
			body: messageContent,
		});
	} else {
		// Update the existing comment
		await danger.github.api.issues.updateComment({
			owner: danger.github.thisPR.owner,
			repo: danger.github.thisPR.repo,
			comment_id: comment.id,
			body: messageContent,
		});
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
codeCoverageCompare().catch((error) => {
	console.error(error);
	throw error;
});
