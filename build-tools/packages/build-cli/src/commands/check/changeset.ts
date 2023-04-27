/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";

export default class CheckChangesetCommand extends BaseCommand<typeof CheckChangesetCommand> {
	static description = ``;

	static flags = {
		branch: Flags.string({
			char: "b",
			description: "The branch to compare against.",
			required: true,
		}),
		...BaseCommand.flags,
	};

	// static examples = [
	// 	{
	// 		description: "Get info about the merge status of the main and next branch in the repo.",
	// 		command: "<%= config.bin %> <%= command.id %>",
	// 	},
	// 	{
	// 		description: "Output the merge status as JSON using --json.",
	// 		command: "<%= config.bin %> <%= command.id %> --json",
	// 	},
	// ];

	public async run(): Promise<void> {
		const context = await this.getContext();
		const repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });
		const remote = await repo.getRemote(context.originRemotePartialUrl);
		const branch = this.flags.branch;

		if (remote === undefined) {
			this.error(`Can't find a remote with ${context.originRemotePartialUrl}`);
		}
		this.verbose(`Remote is: ${remote}`);

		const files = await repo.getChangedFilesSinceRef(branch, remote);

		this.verbose(`Changed files: ${files.length}`);

		const tester = /.changeset\/[^/]+\.md$/;

		const changedChangesetFiles = files.filter((file) => tester.test(file));

		if (changedChangesetFiles.length === 0) {
			this.errorLog(`${JSON.stringify(files, undefined, 2)}`);
			this.error(`No changeset files were added when compared to ${branch}.`);
		}

		this.log(chalk.green(`Found a changeset file: ${changedChangesetFiles}.`));
	}
}
