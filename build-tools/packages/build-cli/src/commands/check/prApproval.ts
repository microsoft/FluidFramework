/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { githubActionsFlag, githubTokenFlag } from "../../flags.js";

import {
	type GitHubProps,
	isPrApprovedByTeam,
	isPrApprovedByUsers,
	// We are slowly moving away from barrel files and these APIs are only used here.
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/githubRest.js";
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
				"The team whose membership should be checked. If at least one of the members of the team has approved the PR, it is considered approved. The team must be in the same GitHub organization as the repo. Only the team name should be provided - the org is inferred from the repo details.",
			exactlyOne: ["team", "approvers"],
		}),
		approvers: Flags.string({
			description:
				"GitHub users who should be considered approvers. If at least one of these users has approved the PR, it is considered approved. Cannot be used with the --team flag. You can provide multiple names as a space-delimited list, e.g. '--approvers user1 user2'",
			multiple: true,
			exactlyOne: ["team", "approvers"],
		}),
		token: githubTokenFlag({
			required: true,
		}),
		ghActions: githubActionsFlag,
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<boolean> {
		const { repo, owner } = this.flags.repo;
		const { token, pr, team: teamName, approvers } = this.flags;
		const props: GitHubProps = {
			owner,
			repo,
			token,
		};

		const isApproved =
			approvers === undefined
				? teamName === undefined
					? // this case shouldn't happen since oclif should guarantee one of
						// approvers or teamName is provided
						false
					: await isPrApprovedByTeam(props, pr, teamName)
				: await isPrApprovedByUsers(props, pr, new Set(approvers));

		// When outputting JSON, just return the raw value. Otherwise throw an error if the PR is not approved.
		if (this.flags.json === true) {
			return isApproved;
		}

		if (!isApproved) {
			const message = `PR ${pr} is not approved by any member of ${teamName}.`;
			if (this.flags.ghActions) {
				this.log(`::error ::${message}`);
			}
			this.error(
				`${message} Check the review details at https://github.com/${owner}/${repo}/pull/${pr}`,
				{ exit: 1 },
			);
		}

		return isApproved;
	}
}
