/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { githubTokenFlag } from "../../flags.js";
// We are slowly moving away from barrel files and these APIs are only used here.
// eslint-disable-next-line import/no-internal-modules
import { type GitHubProps, isPrApprovedByTeam } from "../../library/githubRest.js";
import { BaseCommand } from "../../library/index.js";

/**
 * This command class is used to merge two branches based on the batch size provided.
 * It looks for the last common commit between two branches and computes the remaining commits to be merged.
 * Later, it creates a pull request based on the batch size passed.
 */
export default class CheckPrApprovalCommand extends BaseCommand<
	typeof CheckPrApprovalCommand
> {
	static readonly description =
		"Check if a PR has been approved by a list of users or members of a team.";

	// Enables the global JSON flag in oclif.
	static readonly enableJsonFlag = true;

	static readonly flags = {
		repo: Flags.custom<{ repo: string; owner: string }>({
			description:
				"The name of the GitHub repository to check. This should be in the form 'owner/repo-name'. For example, 'microsoft/FluidFramework'",
			required: true,
			parse: async (input) => {
				const split = input.split("/");
				if (split.length !== 2) {
					throw new Error(`Can't parse '${input}' as a repository.`);
				}
				const [owner, repo] = split;
				return { owner, repo };
			},
		})(),
		pr: Flags.integer({
			description: "The PR number to check.",
			required: true,
			min: 1,
		}),
		team: Flags.string({
			description:
				"The team whose membership should be checked. The team must be in the same GitHub organization as the repo. Only the team name should be provided - the org is inferred from the repo details.",
			required: true,
		}),
		token: githubTokenFlag({
			required: true,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<boolean> {
		const { repo, owner } = this.flags.repo;
		const { token, pr, team: teamName } = this.flags;
		const props: GitHubProps = {
			owner,
			repo,
			token,
		};

		const isApproved = await isPrApprovedByTeam(props, pr, teamName);
		if (this.flags.json === true) {
			return isApproved;
		}

		if (!isApproved) {
			this.error(`PR ${pr} is not approved by any member of ${teamName}.`, { exit: 1 });
		}

		return isApproved;
	}
}
