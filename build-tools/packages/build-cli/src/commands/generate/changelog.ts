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
		if (kind === "packageFromDirectory") {
			return;
		}

		const pkg = new Package(`${directory}/package.json`, "none");
		const version = this.flags.version ?? pkg.version;

		await replaceInFile("## 2.0.0\\n", `## ${version}\\n`, `${directory}/CHANGELOG.md`);
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

		await command("pnpm exec changeset version", this.options);

		// which property do I check on context so I can not install if its already installed?
		await command(`pnpm i`, this.options);

		this.repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });

		await this.repo.gitClient.add(".changeset");
	}

	public async run(): Promise<void> {
		if (this.repo === undefined) {
			this.error("repo is possibly 'undefined'");
		}

		// Calls processPackage on all packages.
		await super.run();

		await command(
			"pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md",
			this.options,
		);

		await this.repo.gitClient.raw("restore", ".");

		await this.repo.gitClient.clean(CleanOptions.RECURSIVE + CleanOptions.FORCE);

		this.log("Commit and open a PR!");
	}
}
