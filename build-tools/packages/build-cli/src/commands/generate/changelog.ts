/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fromInternalScheme, isInternalVersionScheme } from "@fluid-tools/version-tools";
import { FluidRepo, Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { command as execCommand } from "execa";
import { inc } from "semver";
import { CleanOptions } from "simple-git";

import { checkFlags, releaseGroupFlag } from "../../flags.js";
import { BaseCommand, Repository } from "../../library/index.js";
import { isReleaseGroup } from "../../releaseGroups.js";

async function replaceInFile(search: string, replace: string, path: string): Promise<void> {
	const content = await readFile(path, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(path, newContent, "utf8");
}

export default class GenerateChangeLogCommand extends BaseCommand<
	typeof GenerateChangeLogCommand
> {
	static readonly description = "Generate a changelog for packages based on changesets.";

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: true,
		}),
		version: Flags.string({
			description:
				"The version for which to generate the changelog. If this is not provided, the version of the package according to package.json will be used.",
		}),
		install: checkFlags.install,
		...BaseCommand.flags,
	} as const;

	static readonly examples = [
		{
			description: "Generate changelogs for the client release group.",
			command: "<%= config.bin %> <%= command.id %> --releaseGroup client",
		},
	];

	private repo?: Repository;

	private async processPackage(pkg: Package): Promise<void> {
		const { directory, version: pkgVersion } = pkg;

		// This is the version that the changesets tooling calculates by default. It does a semver major bump on the current
		// version. We search for that version in the generated changelog and replace it with the one that we want.
		// For internal versions, bumping the semver major is the same as just taking the public version from the internal
		// version and using it directly.
		const changesetsCalculatedVersion = isInternalVersionScheme(pkgVersion)
			? fromInternalScheme(pkgVersion)[0].version
			: inc(pkgVersion, "major");
		const versionToUse = this.flags.version ?? pkgVersion;

		// Replace the changeset version with the correct version.
		await replaceInFile(
			`## ${changesetsCalculatedVersion}\n`,
			`## ${versionToUse}\n`,
			`${directory}/CHANGELOG.md`,
		);

		// For changelogs that had no changesets applied to them, add in a 'dependency updates only' section.
		await replaceInFile(
			`## ${versionToUse}\n\n## `,
			`## ${versionToUse}\n\nDependency updates only.\n\n## `,
			`${directory}/CHANGELOG.md`,
		);
	}

	public async run(): Promise<void> {
		const context = await this.getContext();

		const gitRoot = context.gitRepo.resolvedRoot;

		const { install, releaseGroup } = this.flags;

		if (releaseGroup === undefined) {
			this.error("ReleaseGroup is possibly 'undefined'");
		}

		const monorepo =
			releaseGroup === undefined ? undefined : context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			this.error(`Release group ${releaseGroup} not found in repo config`, { exit: 1 });
		}

		const execDir = monorepo?.directory ?? gitRoot;
		await execCommand("pnpm exec changeset version", { cwd: execDir });

		const packagesToCheck = isReleaseGroup(releaseGroup)
			? context.packagesInReleaseGroup(releaseGroup)
			: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				[context.fullPackageMap.get(releaseGroup)!];

		if (install) {
			const installed = await FluidRepo.ensureInstalled(packagesToCheck);

			if (!installed) {
				this.error(`Error installing dependencies for: ${releaseGroup}`);
			}
		}

		this.repo = new Repository({ baseDir: execDir });

		// git add the deleted changesets
		await this.repo.gitClient.add(".changeset/**");

		// git restore the package.json files that were changed by changeset version
		await this.repo.gitClient.raw("restore", "**package.json");

		// Calls processPackage on all packages.
		const processPromises: Promise<void>[] = [];
		for (const pkg of packagesToCheck) {
			processPromises.push(this.processPackage(pkg));
		}
		const results = await Promise.allSettled(processPromises);
		const failures = results.filter((p) => p.status === "rejected");
		if (failures.length > 0) {
			this.error(
				`Error processing packages; failure reasons:\n${failures
					.map((p) => (p as PromiseRejectedResult).reason as string)
					.join(", ")}`,
				{ exit: 1 },
			);
		}

		// git add the changelog changes
		await this.repo.gitClient.add("**CHANGELOG.md");

		// Cleanup: git restore any edits that aren't staged
		await this.repo.gitClient.raw("restore", ".");

		// Cleanup: git clean any untracked files
		await this.repo.gitClient.clean(CleanOptions.RECURSIVE + CleanOptions.FORCE);

		this.log("Commit and open a PR!");
	}
}
