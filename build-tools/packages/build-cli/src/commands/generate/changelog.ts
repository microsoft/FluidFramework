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
import path from "path";
import { Package } from "@fluidframework/build-tools";

async function replaceInFile(search: string, replace: string, filePath: string): Promise<void> {
	const content = await readFile(filePath, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(filePath, newContent, "utf8");
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
		path: Flags.directory({
			description:
				"Path to a directory containing a package. The version will be loaded from the package.json in this directory.",
			exists: true,
			exclusive: ["version"],
		}),
		...PackageCommand.flags,
	};

	static examples = [
		{
			description: "Create an changelog using the --version flag.",
			command: "<%= config.bin %> <%= command.id %> --version 1.0.0",
		},
	];

	private versionToCheck: string | undefined;
	private path: string | undefined;

	protected async processPackage(directory: string, kind: PackageKind): Promise<void> {
		await replaceInFile("## 2.0.0\\n", `## ${this.versionToCheck}\\n`, `${this.path}/CHANGELOG.md`);
		await replaceInFile(
			`## ${this.versionToCheck}\\n\\n## `,
			`## ${this.versionToCheck}\\n\\nDependency updates only.\\n\\n## `,
			`${this.path}/CHANGELOG.md`,
		);
	}

	public async init(): Promise<void> {
		await super.init();

		if (typeof this.flags.version === "string") {
			this.versionToCheck = this.flags.version;
		} else {
			const pkg = new Package(path.join(process.cwd(), "package.json"), "none");
			this.versionToCheck = pkg.version;
		}

		this.path = this.flags.path === undefined ? this.flags.path : process.cwd();
		
	}

	public async run(): Promise<void> {
		
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

		const result = await command(
			"pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md",
			opts,
		); // repo.gitClient here?
		this.log(result.stdout);

		const rawRestore = await repo.gitClient.raw("restore", ".");
		const cleanResponse = await repo.gitClient.clean(
			CleanOptions.RECURSIVE + CleanOptions.FORCE,
		);

		this.log("Commit and open a PR!");
	}
}
