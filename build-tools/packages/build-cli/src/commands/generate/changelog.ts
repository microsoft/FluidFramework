/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { command, Options } from "execa";
import { PackageCommand, PackageKind } from "../../BasePackageCommand";
import { Repository } from "../../lib";
import fs from "fs/promises";
import { CleanOptions } from "simple-git";

async function replaceInFile(search: string, replace: string, path: string): Promise<void> {
	const content = await fs.readFile(path, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await fs.writeFile(path, newContent, "utf8");
}

export default class GenerateChangeLogCommand extends PackageCommand<
	typeof GenerateChangeLogCommand
> {
	static description = "Generate a changelog for a new version";

	static flags = {
		version: Flags.string({
			char: "v",
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

	protected async processPackage(directory: string, kind: PackageKind): Promise<void> {
		throw new Error("Method not implemented.");
	}

	public async init(): Promise<void> {
		await super.init();
	}

	public async run(): Promise<void> {
		const { version } = this.flags;
		const context = await this.getContext();

		// Calls processPackage on all packages.
		await super.run();

		const opts: Options = { cwd: context.gitRepo.resolvedRoot };
		const repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });
		// const remote = await repo.getRemote(context.originRemotePartialUrl);

		const installResult = await command(`pnpm i`, opts);
		this.log(installResult.stdout);

		const changesetVersionResult = await command("pnpm exec changeset version", opts);
		this.log(changesetVersionResult.stdout);

		const rawchangesetAdd = await repo.gitClient.add(".changeset");

		await replaceInFile("## 2.0.0\\n", `## ${version}\\n`, "CHANGELOG.md");

		const replace1Result = await command(
			`pnpm -r exec -- sd "## 2.0.0\\n" "## ${version}\\n" CHANGELOG.md`,
			opts,
		); // TODO how to put replaceInFile instead of sd
		this.log(replace1Result.stdout);

		await replaceInFile(
			`## ${version}\\n\\n## `,
			`## ${version}\\n\\nDependency updates only.\\n\\n## `,
			"CHANGELOG.md",
		);
		const replace2Result = await command(
			`pnpm -r exec -- sd "## ${version}\\n\\n## " "## ${version}\\n\\nDependency updates only.\\n\\n## " CHANGELOG.md`,
			opts,
		); // TODO how to put replaceInFile instead of sd
		this.log(replace2Result.stdout);

		const result = await command(
			"pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md",
			opts,
		); // repo.gitClient here?
		this.log(result.stdout);

		const rawRestore = await repo.gitClient.raw("restore", ".");
		const cleanResponse = await repo.gitClient.clean(
			CleanOptions.RECURSIVE + CleanOptions.FORCE,
		);
	}
}
