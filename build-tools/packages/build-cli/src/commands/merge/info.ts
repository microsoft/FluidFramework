/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import chalk from "picocolors";

import { BaseCommand } from "../../library/index.js";

/**
 * An object containing merge status between two branches.
 */
interface BranchMergeInfo {
	/**
	 * The branches being compared.
	 */
	branches: string[];
	/**
	 * The number of commits difference between the branches. This will equal the length of the commits array and is
	 * included for convenience.
	 */
	commitCount: number;

	/**
	 * The commits that are in branch 1 but not branch 2.
	 */
	commits: string[];
}

export default class MergeInfoCommand extends BaseCommand<typeof MergeInfoCommand> {
	static readonly description =
		`Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided. Output the data as JSON using --json.`;

	static readonly enableJsonFlag = true;
	static readonly flags = {
		branch: Flags.string({
			char: "b",
			description:
				"A branch name. Use this argument multiple times to provide multiple branch names.",
			multiple: true,
		}),
		...BaseCommand.flags,
	} as const;

	static readonly examples = [
		{
			description: "Get info about the merge status of the main and next branch in the repo.",
			command: "<%= config.bin %> <%= command.id %>",
		},
		{
			description: "Output the merge status as JSON using --json.",
			command: "<%= config.bin %> <%= command.id %> --json",
		},
	];

	public async run(): Promise<BranchMergeInfo> {
		const { flags } = this;
		const branchFlags = flags.branch;

		let branch1: string;
		let branch2: string;

		// Default to main and next
		if (branchFlags === undefined || branchFlags.length === 0) {
			[branch1, branch2] = ["main", "next"];
		} else if (branchFlags.length === 1) {
			[branch1, branch2] = [branchFlags[0], "next"];
		} else {
			[branch1, branch2] = branchFlags;
		}

		if (branchFlags !== undefined && branchFlags.length > 2) {
			this.warning(
				`Only two branch names are used; ignoring the following arguments: ${[
					branchFlags.slice(2),
				]}`,
			);
		}

		const context = await this.getContext();
		const repo = await context.getGitRepository();
		const remote = await repo.getRemote(repo.upstreamRemotePartialUrl);

		if (remote === undefined) {
			this.error(`Can't find a remote with ${repo.upstreamRemotePartialUrl}`);
		}
		this.verbose(`Remote is: ${remote}`);

		// get merge base
		const base = await repo.getMergeBaseRemote(
			branch1,
			remote,
			`refs/remotes/${remote}/${branch2}`,
		);
		const rawRevs = await repo.gitClient.raw(
			"rev-list",
			`${base}..refs/remotes/${remote}/${branch1}`,
		);

		const revs = rawRevs.split(/\r?\n/);

		const [b1Log, b2Log] = [chalk.bold(chalk.blue(branch1)), chalk.bold(chalk.blue(branch2))];

		this.logHr();
		this.log(
			` The ${b2Log} branch is ${chalk.bold(revs.length.toString())} commits ${chalk.red(
				"behind",
			)} ${b1Log}`,
		);
		this.log();

		// If --json is passed, this object is output to stdout JSON-serialized.
		return { branches: [branch1, branch2], commits: revs, commitCount: revs.length };
	}
}
