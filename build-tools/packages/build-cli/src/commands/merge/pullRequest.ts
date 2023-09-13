/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";

import { BaseCommand } from "../../base";
import { mergePullRequest } from "../../lib";

export default class MergePullRequest extends BaseCommand<typeof MergePullRequest> {
	static readonly description = "Merge Pull Request";

	static flags = {
		pat: Flags.string({
			description:
				"GitHub Personal Access Token. This parameter should be passed using the GITHUB_PAT environment variable for security purposes.",
			char: "p",
			required: true,
			env: "GITHUB_PAT",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		// squash pr
		// fetch the pr number
		const pr = {
			token: flags.pat,
			owner: "sonalideshpandemsft",
			repo: "FluidFramework",
			title: "Title",
			description: "description",
			prNumber: 1234,
		};

		await mergePullRequest(pr, this.logger);

		// merge pr
		// fetch the automation pr
		// find the commit id
		// create comment on the automation pr - "this PR is queued to be merged in next in 10mins. please close the PR if you want to stop the merge"
		// git checkout next
		// git pull
		// git fetch
		// git merge --ff-only COMMIT_ID -> returns an error imples HEAD of next has changed
		// git push
	}
}
