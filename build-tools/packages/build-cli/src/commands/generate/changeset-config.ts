/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import {
	type ChangesetConfigWritten,
	Package,
	type PackageNameOrScope,
	type PackageScopeSelectors,
	isPackageScope,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { mkdirp, readJSON, writeJSON } from "fs-extra/esm";
import sortObject from "sort-object-keys";
import { releaseGroupFlag } from "../../flags.js";
import { BaseCommand, type Context } from "../../library/index.js";
import type { ReleaseGroup } from "../../releaseGroups.js";

const defaultConfig: ChangesetConfigWritten = {
	$schema: "https://unpkg.com/@changesets/config@2.3.0/schema.json",
	commit: false,
	access: "public",
	baseBranch: "main",
	updateInternalDependencies: "patch",
};

/**
 * Returns true if a package matches one of the provided selectors.
 *
 * @param pkg - The package to check.
 * @param selectors - The selectors to apply.
 * @returns true if the package matches; false otherwise.
 */
function packageMatchesSelectors(pkg: Package, selectors: PackageScopeSelectors): boolean {
	for (const selector of Object.values(selectors)) {
		for (const entry of selector) {
			if (pkg.name === entry) {
				return true;
			}
			if (isPackageScope(entry) && pkg.name.startsWith(entry)) {
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
	selectors: PackageScopeSelectors | undefined,
): PackageNameOrScope[][] {
	const results: PackageNameOrScope[][] = [];

	for (const releaseGroup of releaseGroups) {
		const packagesToCheck = context
			.packagesInReleaseGroup(releaseGroup)
			.filter((pkg) => selectors !== undefined && packageMatchesSelectors(pkg, selectors));
		const names = packagesToCheck.map((p) => p.name).sort();
		if (names.length > 0) {
			results.push(names);
		}
	}
	return results;
}

export default class GenerateChangesetConfigCommand extends BaseCommand<
	typeof GenerateChangesetConfigCommand
> {
	static readonly summary = "Generates a configuration file for changesets.";

	static readonly description =
		"This command is used to dynamically create fixed and linked package groups in the changesets config. Existing settings in the changeset config will be retained EXCEPT for fixed and linked groups. Those are always overwritten.";

	// Enables the global JSON flag in oclif.
	static readonly enableJsonFlag = true;

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			// Changeset config is currently per-workspace/release group, so require a release group to be provided.
			required: true,
		}),
		outFile: Flags.file({
			char: "o",
			description:
				"Path to write the changeset config file to. The file will always be overwritten.",
			default: ".changeset/config.json",
		}),
		...BaseCommand.flags,
	} as const;

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

		const newConfig = { ...defaultConfig, ...currentConfig };

		// Always override the fixed/linked packages.
		const newFixed = getFixedPackageGroups(context, [releaseGroup], changesetConfig?.fixed);
		const newLinked = getFixedPackageGroups(context, [releaseGroup], changesetConfig?.linked);
		newConfig.fixed = newFixed.length === 0 ? newConfig.fixed : newFixed;
		newConfig.linked = newLinked.length === 0 ? newConfig.linked : newLinked;

		await mkdirp(path.dirname(outFile));
		await writeJSON(outFile, sortObject(newConfig), { spaces: "\t" });

		return sortObject(newConfig);
	}
}
