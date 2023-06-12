/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { command, Options } from "execa";
import { PackageCommand, PackageKind } from "../../BasePackageCommand";
import { Repository } from "../../lib";
import { readFile, writeFile } from "fs/promises";
import { CleanOptions } from "simple-git";
import { Package } from "@fluidframework/build-tools";

async function replaceInFile(search: string, replace: string, path: string): Promise<void> {
	const content = await readFile(path, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(path, newContent, "utf8");
}

export default class GenerateChangeLogCommand extends PackageCommand<
	typeof GenerateChangeLogCommand
> {
	static description = "Generate a changelog for a new version";

	static flags = {
		version: Flags.string({
			description: "The version for which to generate the changelog",
			required: true,
		}),
		...PackageCommand.flags,
	};

	static examples = [
		{
			description: "Create an changelog using the --version flag.",
			command: "<%= config.bin %> <%= command.id %> --version 1.0.0",
		},
	];

	private options?: Options;
	private repo?: Repository;

	protected async processPackage(directory: string, kind: PackageKind): Promise<void> {
		const pkg = new Package(`${directory}/package.json`, "none");
		const version =
			typeof this.flags.version === "string"
				? this.flags.version
				: pkg.version;

		await replaceInFile(
			"## 2.0.0\\n",
			`## ${version}\\n`,
			`${directory}/CHANGELOG.md`,
		);
		await replaceInFile(
			`## ${version}\\n\\n## `,
			`## ${version}\\n\\nDependency updates only.\\n\\n## `,
			`${directory}/CHANGELOG.md`,
		);
	}

	public async init(): Promise<void> {
		await super.init();
		const context = await this.getContext();
		this.options = { cwd: context.gitRepo.resolvedRoot };
		const changesetVersionResult = await command("pnpm exec changeset version", this.options);
		this.log(changesetVersionResult.stdout);

		// I remember you said during the meeting you can check if we need to pnpm i from context

		const installResult = await command(`pnpm i`, this.options);
		this.log(installResult.stdout);

		this.repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });

		const rawchangesetAdd = await this.repo.gitClient.add(".changeset");
		this.log(rawchangesetAdd);
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages.
		await super.run();

		if(this.repo === undefined){
			this.error("repo is possibly 'undefined'");
		}
		// const remote = await repo.getRemote(context.originRemotePartialUrl);

		const result = await command(
			"pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md",
			this.options,
		); // repo.gitClient here?
		this.log(result.stdout);

		const rawRestore = await this.repo.gitClient.raw("restore", ".");
		const cleanResponse = await this.repo.gitClient.clean(
			CleanOptions.RECURSIVE + CleanOptions.FORCE,
		);

		this.log("Commit and open a PR!");
	}
}
