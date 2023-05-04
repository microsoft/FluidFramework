/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";
import humanId from "human-id";
import inquirer from "inquirer";
import * as cplus from "inquirer-checkbox-plus-prompt";
import path from "node:path";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";
import { Context, Package } from "@fluidframework/build-tools";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { ReleaseGroup } from "../../releaseGroups";
import { writeFile } from "node:fs/promises";

const DEFAULT_BRANCH = "main";

inquirer.registerPrompt("checkbox-plus", cplus);

export default class GenerateChangesetCommand extends BaseCommand<typeof GenerateChangesetCommand> {
	static summary = `Generates a new changeset file.`;

	static flags = {
		branch: Flags.string({
			char: "b",
			description:
				"The branch to compare against. This is used to populate the list of changed packages.",
			default: DEFAULT_BRANCH,
		}),
		empty: Flags.boolean({
			description: "Create an empty changeset file.",
		}),
		...BaseCommand.flags,
	};

	static examples = [
		// {
		// 	description: "Check if a changeset was added when compared to the 'main' branch.",
		// 	command: "<%= config.bin %> <%= command.id %> -b main",
		// },
		// {
		// 	description: "Check if a changeset was added when compared to the 'next' branch.",
		// 	command: "<%= config.bin %> <%= command.id %> -b next",
		// },
	];

	public async run(): Promise<void> {
		const context = await this.getContext();
		const { branch, empty } = this.flags;

		if (empty) {
			// TODO: This only works for the root release group (client). Is that OK?
			const newFile = await createChangesetFile(context.gitRepo.resolvedRoot, new Map());
			this.logHr();
			this.log(
				`Created empty changeset: ${chalk.green(
					path.relative(context.gitRepo.resolvedRoot, newFile),
				)}`,
			);
			this.exit(0);
		}

		const repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });
		const remote = await repo.getRemote(context.originRemotePartialUrl);

		if (remote === undefined) {
			// Logs and exits
			this.error(`Can't find a remote with ${context.originRemotePartialUrl}`, { exit: 1 });
		}
		this.verbose(`Remote is: ${remote}`);

		const { packages: changedPackages, files: changedFiles } = await repo.getChangedSinceRef(
			branch,
			remote,
			context,
		);
		if (changedFiles.length === 0) {
			this.error(`No changes when compared to ${branch}.`, { exit: 1 });
		}

		if (changedPackages.length > 0) {
			this.error(`No changed packages when compared to ${branch}.`, { exit: 1 });
		}
	}
}

async function createChangesetFile(
	rootPath: string,
	packages: Map<Package, VersionBumpType>,
	body?: string,
): Promise<string> {
	const changesetID = humanId({ separator: "-", capitalize: false });
	const changesetPath = path.join(rootPath, ".changeset", `${changesetID}.md`);
	const changesetContent = await createChangesetContent(packages, body);
	await writeFile(changesetPath, changesetContent);
	return changesetPath;
}

async function createChangesetContent(packages: Map<Package, VersionBumpType>, body?: string) {
	const lines: string[] = ["---"];
	for (const [pkg, bump] of packages.entries()) {
		lines.push(`"${pkg.name}": ${bump}`);
	}
	lines.push("---");
	const frontMatter = lines.join("\n");
	const changesetContents = [frontMatter, body].join("\n");
	return changesetContents;
}
