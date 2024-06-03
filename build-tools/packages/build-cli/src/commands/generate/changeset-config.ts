/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ChangesetConfig,
	type ChangesetConfigWritten,
	Package,
	type PackageNameOrScope,
	isPackageScope,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";

import { existsSync } from "node:fs";
import path from "node:path";
import { mkdirp, readJSON, writeJSON } from "fs-extra/esm";
import { releaseGroupFlag } from "../../flags.js";
import { BaseCommand, type Context } from "../../library/index.js";
import type { ReleaseGroup } from "../../releaseGroups.js";

const defaultConfig: ChangesetConfigWritten = {
	"$schema": "https://unpkg.com/@changesets/config@2.3.0/schema.json",
	commit: false,
	access: "public",
	baseBranch: "main",
	updateInternalDependencies: "patch",
};

// type PackageName = string;

function packageMatchesFixedConfig(pkg: Package, changesetConfig: ChangesetConfig): boolean {
	for (const config of Object.values(changesetConfig.fixed ?? {})) {
		for (const configEntry of config) {
			if (pkg.name === configEntry) {
				return true;
			}
			if (isPackageScope(configEntry) && pkg.name.startsWith(configEntry)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Returns an array of package arrays that should be in the 'fixed' section of the changesetsConfig.
 */
function getFixedPackageGroups(
	context: Context,
	releaseGroups: ReleaseGroup[],
	changesetConfig: ChangesetConfig,
): PackageNameOrScope[][] {
	// const packagesToCheck = releaseGroup === undefined ? context.packages : context.packagesInReleaseGroup(releaseGroup);
	// const results: Map<string, PackageName[]> = new Map();
	const results: PackageNameOrScope[][] = [];

	for (const releaseGroup of releaseGroups) {
		const packagesToCheck = context
			.packagesInReleaseGroup(releaseGroup)
			.filter((pkg) => packageMatchesFixedConfig(pkg, changesetConfig));
		results.push(packagesToCheck.map((p) => p.name).sort());
	}
	return results;
}

export default class GenerateChangesetConfigCommand extends BaseCommand<
	typeof GenerateChangesetConfigCommand
> {
	static readonly summary = "Generates a configuration file for changesets.";

	// static readonly aliases: string[] = [
	// 	// 'add' is the verb that the standard changesets cli uses. It's also shorter than 'generate'.
	// 	"changeset:add",
	// ];

	// Enables the global JSON flag in oclif.
	// static readonly enableJsonFlag = true;

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: true,
		}),
		outFile: Flags.file({
			char: "o",
			description:
				"Path to write the changeset config file to. The file will always be overwritten.",
			default: ".changeset/config.json",
		}),
		// fixedPackages: Flags.file({
		// 	description: "Path to a"
		// }),
		...BaseCommand.flags,
	} as const;

	// static readonly examples = [
	// 	{
	// 		description: "Create an empty changeset using the --empty flag.",
	// 		command: "<%= config.bin %> <%= command.id %> --empty",
	// 	},
	// 	{
	// 		description: `Create a changeset interactively. Any package whose contents has changed relative to the '${DEFAULT_BRANCH}' branch will be selected by default.`,
	// 		command: "<%= config.bin %> <%= command.id %>",
	// 	},
	// 	{
	// 		description: `You can compare with a different branch using --branch (-b).`,
	// 		command: "<%= config.bin %> <%= command.id %> --branch next",
	// 	},
	// 	{
	// 		description: `By default example and private packages are excluded, but they can be included with --all.`,
	// 		command: "<%= config.bin %> <%= command.id %> --all",
	// 	},
	// ];

	public async run(): Promise<ChangesetConfigWritten> {
		const context = await this.getContext();
		const { releaseGroup, outFile } = this.flags;
		const { changesetConfig } = context.rootFluidBuildConfig;

		const monorepo =
			releaseGroup === undefined ? undefined : context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			this.error(`Release group ${releaseGroup} not found in repo config`, { exit: 1 });
		}

		const currentConfig: ChangesetConfigWritten = existsSync(outFile)
			? ((await readJSON(outFile)) as ChangesetConfigWritten)
			: defaultConfig;

		// Always override the fixed/linked packages.
		// TODO: merge with existing in some way?

		// Fixed packages
		const newFixed = getFixedPackageGroups(context, [releaseGroup], changesetConfig ?? {});
		currentConfig.fixed = newFixed.length === 0 ? currentConfig.fixed : newFixed;

		await mkdirp(path.dirname(outFile));
		await writeJSON(outFile, currentConfig, { spaces: "\t" });

		return currentConfig;
	}
}
