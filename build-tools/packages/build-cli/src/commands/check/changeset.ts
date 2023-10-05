/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { sortPackageJson as sortJson } from "sort-package-json";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";

export default class CheckChangesetCommand extends BaseCommand<typeof CheckChangesetCommand> {
	static summary = `Checks if a changeset was added when compared against a branch. This is used in CI to enforce that changesets are present for a PR.`;

	static enableJsonFlag = true;

	static flags = {
		branch: Flags.string({
			char: "b",
			description: "The branch to compare against.",
			required: true,
		}),
		...BaseCommand.flags,
	};

	static examples = [
		{
			description: "Check if a changeset was added when compared to the 'main' branch.",
			command: "<%= config.bin %> <%= command.id %> -b main",
		},
		{
			description: "Check if a changeset was added when compared to the 'next' branch.",
			command: "<%= config.bin %> <%= command.id %> -b next",
		},
	];

	public async run(): Promise<{
		changesetFound: boolean;
		branch: string;
		changesetPath?: string;
	}> {
		const context = await this.getContext();
		const repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });
		const remote = await repo.getRemote(context.originRemotePartialUrl);
		const branch = this.flags.branch;

		if (remote === undefined) {
			this.error(`Can't find a remote with ${context.originRemotePartialUrl}`);
		}
		this.verbose(`Remote is: ${remote}`);

		const { files } = await repo.getChangedSinceRef(branch, remote, context);
		const changesetPathRegex = /.changeset\/[^/]+\.md$/;

		const changedChangesetFiles = files.filter((file) => changesetPathRegex.test(file));

		if (changedChangesetFiles.length === 0) {
			this.errorLog(`No changeset files were added when compared to ${branch}.`);
			this.verbose(`Changed files: ${JSON.stringify(files, undefined, 2)}`);

			// When we output JSON, we don't want to exit with a failure error code. Instead we return the failure as part of
			// the JSON.
			if (this.flags.json === true) {
				return sortJson({
					changesetFound: false,
					branch,
				});
			}
			this.exit(1);
		}

		this.log(chalk.green(`Found a changeset file: ${changedChangesetFiles[0]}.`));

		return sortJson({
			changesetFound: true,
			branch,
			changesetPath: changedChangesetFiles[0],
		});
	}
}
