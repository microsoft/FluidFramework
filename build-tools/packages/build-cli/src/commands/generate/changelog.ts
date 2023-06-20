/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { command as execCommand } from "execa";
import { PackageCommand, PackageKind } from "../../BasePackageCommand";
import { Repository } from "../../lib";
import { readFile, writeFile } from "fs/promises";
import { CleanOptions } from "simple-git";
import { Package, FluidRepo } from "@fluidframework/build-tools";
import { isReleaseGroup } from "../../releaseGroups";

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
			description: "Generate changelogs for version 1.0.0.",
			command: "<%= config.bin %> <%= command.id %> --version 1.0.0",
		},
	];

	private repo?: Repository;

	protected async processPackage(directory: string, kind: PackageKind): Promise<void> {
		if (kind === "packageFromDirectory") {
			return;
		}

		const pkg = new Package(`${directory}/package.json`, "none");
		const version = this.flags.version ?? pkg.version;

		await replaceInFile("## 2.0.0\n", `## ${version}\n`, `${directory}/CHANGELOG.md`);
		await replaceInFile(
			`## ${version}\n\n## `,
			`## ${version}\n\nDependency updates only.\n\n## `,
			`${directory}/CHANGELOG.md`,
		);
	}

	public async init(): Promise<void> {
		await super.init();

		const context = await this.getContext();

		const gitRoot = context.gitRepo.resolvedRoot;

		const { releaseGroup } = this.flags;

		if (releaseGroup === undefined) {
			this.error("ReleaseGroup is possibly 'undefined'");
		}

		await execCommand("pnpm exec changeset version", { cwd: gitRoot });

		const packagesToCheck = isReleaseGroup(releaseGroup)
			? context.packagesInReleaseGroup(releaseGroup)
			: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			  [context.fullPackageMap.get(releaseGroup)!];

		const installed = await FluidRepo.ensureInstalled(packagesToCheck, true);

		if (!installed) {
			this.error(`Error installing dependencies for: ${releaseGroup}`);
		}

		this.repo = new Repository({ baseDir: gitRoot });

		// git add the deleted changesets
		await this.repo.gitClient.add(".changeset");

		// git restore the package.json files that were changed by changeset version
		await this.repo.gitClient.raw("restore", "**package.json");
	}

	public async run(): Promise<void> {
		if (this.repo === undefined) {
			this.error("Repository is possibly 'undefined'");
		}

		// Calls processPackage on all packages.
		await super.run();

		// git add the changelog changes
		await this.repo.gitClient.add("**CHANGELOG.md");

		// Cleanup: git restore any edits that aren't staged
		await this.repo.gitClient.raw("restore", ".");

		// Cleanup: git clean any untracked files
		await this.repo.gitClient.clean(CleanOptions.RECURSIVE + CleanOptions.FORCE);

		this.log("Commit and open a PR!");
	}
}
