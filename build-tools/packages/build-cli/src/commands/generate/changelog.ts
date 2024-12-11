/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type VersionBumpType,
	bumpVersionScheme,
	isInternalVersionScheme,
} from "@fluid-tools/version-tools";
import { FluidRepo, Package } from "@fluidframework/build-tools";
import { ux } from "@oclif/core";
import { command as execCommand } from "execa";
import { inc } from "semver";
import { CleanOptions } from "simple-git";

import { checkFlags, releaseGroupFlag, semverFlag } from "../../flags.js";
import { BaseCommand, DEFAULT_CHANGESET_PATH, loadChangesets } from "../../library/index.js";
import { isReleaseGroup } from "../../releaseGroups.js";

async function replaceInFile(
	search: string,
	replace: string,
	filePath: string,
): Promise<void> {
	const content = await readFile(filePath, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(filePath, newContent, "utf8");
}

export default class GenerateChangeLogCommand extends BaseCommand<
	typeof GenerateChangeLogCommand
> {
	static readonly description = "Generate a changelog for packages based on changesets.";

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: true,
		}),
		version: semverFlag({
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

	private bumpType?: VersionBumpType;

	private async processPackage(pkg: Package): Promise<void> {
		const { directory, version: pkgVersion } = pkg;
		const bumpType = this.bumpType ?? "patch";

		// This is the version that the changesets tooling calculates by default. It does a bump of the highest semver type
		// in the changesets on the current version. We search for that version in the generated changelog and replace it
		// with the one that we want.
		const changesetsCalculatedVersion = isInternalVersionScheme(pkgVersion)
			? bumpVersionScheme(pkgVersion, bumpType, "internal")
			: inc(pkgVersion, bumpType);
		const versionToUse = this.flags.version?.version ?? pkgVersion;

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

	/**
	 * Removes any custom metadata from all changesets and writes the resulting changes back to the source files. This
	 * metadata needs to be removed prior to running `changeset version` from the \@changesets/cli package. If it is not,
	 * then the custom metadata is interpreted as part of the content and the changelogs end up with the metadata in them.
	 *
	 * For more information about the custom metadata we use in our changesets, see
	 * https://github.com/microsoft/FluidFramework/wiki/Changesets#custom-metadata
	 *
	 * **Note that this is a lossy action!** The metadata is completely removed. Changesets are typically in source
	 * control so changes can usually be reverted.
	 */
	private async canonicalizeChangesets(releaseGroupRootDir: string): Promise<void> {
		const changesetDir = path.join(releaseGroupRootDir, DEFAULT_CHANGESET_PATH);
		const changesets = await loadChangesets(changesetDir, this.logger);

		// Determine the highest bump type and save it for later - it determines the changesets-calculated version.
		const bumpTypes: Set<VersionBumpType> = new Set();
		for (const changeset of changesets) {
			for (const bumpType of changeset.changeTypes) {
				bumpTypes.add(bumpType);
			}
		}
		this.bumpType = bumpTypes.has("major")
			? "major"
			: bumpTypes.has("minor")
				? "minor"
				: "patch";

		const toWrite: Promise<void>[] = [];
		for (const changeset of changesets) {
			const metadata = Object.entries(changeset.metadata).map((entry) => {
				const [packageName, bump] = entry;
				return `"${packageName}": ${bump}`;
			});
			const output = `---\n${metadata.join("\n")}\n---\n\n${changeset.summary}\n\n${changeset.body}\n`;
			this.info(`Writing canonical changeset: ${changeset.sourceFile}`);
			toWrite.push(writeFile(changeset.sourceFile, output));
		}
		await Promise.all(toWrite);
	}

	public async run(): Promise<void> {
		const context = await this.getContext();

		const gitRoot = context.root;

		const { install, releaseGroup } = this.flags;

		if (releaseGroup === undefined) {
			this.error("ReleaseGroup is possibly 'undefined'");
		}

		const monorepo =
			releaseGroup === undefined ? undefined : context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			this.error(`Release group ${releaseGroup} not found in repo config`, { exit: 1 });
		}

		const releaseGroupRoot = monorepo?.directory ?? gitRoot;

		// Strips additional custom metadata from the source files before we call `changeset version`,
		// because the changeset tools - like @changesets/cli - only work on canonical changesets.
		await this.canonicalizeChangesets(releaseGroupRoot);

		// The `changeset version` command applies the changesets to the changelogs
		ux.action.start("Running `changeset version`");
		await execCommand("pnpm exec changeset version", { cwd: releaseGroupRoot });
		ux.action.stop();

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

		const repo = await context.getGitRepository();

		// git add the deleted changesets (`changeset version` deletes them)
		await repo.gitClient.add(".changeset/**");

		// git restore the package.json files that were changed by `changeset version`
		await repo.gitClient.raw("restore", "**package.json");

		// Calls processPackage on all packages.
		ux.action.start("Processing changelog updates");
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
		await repo.gitClient.add("**CHANGELOG.md");

		// Cleanup: git restore any edits that aren't staged
		await repo.gitClient.raw("restore", ".");

		// Cleanup: git clean any untracked files
		await repo.gitClient.clean(CleanOptions.RECURSIVE + CleanOptions.FORCE);
		ux.action.stop();

		this.log("Commit and open a PR!");
	}
}
