/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { MonoRepo, Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { mkdirpSync } from "fs-extra";
import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../args.js";
import { filterPackages, parsePackageFilterFlags } from "../filter.js";
import { filterFlags, releaseGroupFlag } from "../flags.js";
import { BaseCommand, getTarballName } from "../library/index.js";
import {
	type Feed,
	feeds,
	isFeed,
	packagePublishesToFeed,
	// eslint-disable-next-line import/no-internal-modules -- the policy-related stuff will eventually be moved into this package
} from "../library/repoPolicyCheck/npmPackages.js";
import { PnpmListEntry, pnpmList } from "../pnpm.js";

interface ListItem extends PnpmListEntry {
	tarball?: string;
}

/**
 * Lists all the packages in a release group in topological order.
 *
 * @remarks
 * This command is primarily used in our CI pipelines to ensure we publish packages in order to prevent customers from
 * seeing errors if they happen to be installing packages while we are publishing a new release.
 */
export default class ListCommand extends BaseCommand<typeof ListCommand> {
	static readonly description = `List packages in a release group in topological order.`;
	static readonly enableJsonFlag = true;

	static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg({ required: false }),
	} as const;

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			exclusive: ["package"],
			deprecated: {
				message:
					"The --releaseGroup flag is no longer needed. You can pass either a release group or package name directly as an argument.",
			},
		}),
		feed: Flags.custom<Feed | undefined>({
			description:
				"Filter the resulting packages to those that should be published to a particular npm feed. Use 'public' for public npm. The 'official' and 'internal' values are deprecated and should not be used.",
			options: [...feeds, "official", "internal"],
			helpGroup: "PACKAGE FILTER",
			required: false,
			parse: async (str: string) => {
				if (isFeed(str)) {
					return str;
				}
				// Handle back-compat values
				if (str === "official") {
					return "public";
				}

				if (str === "internal") {
					return "internal-build";
				}
			},
		})(),
		...filterFlags,
		tarball: Flags.boolean({
			description:
				"Return packed tarball names (without extension) instead of package names. @-signs will be removed from the name, and slashes are replaced with dashes.",
			default: false,
		}),
		outFile: Flags.file({
			description:
				"Output file to write the list of packages to. If not specified, the list will be written to stdout.",
			required: false,
			exists: false,
		}),
	};

	public async run(): Promise<ListItem[]> {
		const { feed, outFile, releaseGroup: releaseGroupName, tarball } = this.flags;
		const context = await this.getContext();
		const lookupName = releaseGroupName ?? this.args.package_or_release_group;
		if (lookupName === undefined) {
			this.error(`No release group or package flag found.`, { exit: 1 });
		}
		const rgOrPackage = findPackageOrReleaseGroup(lookupName, context);

		// Handle single packages
		if (rgOrPackage instanceof Package) {
			const item = await this.outputSinglePackage(rgOrPackage);
			return [item];
		}

		if (rgOrPackage === undefined || !(rgOrPackage instanceof MonoRepo)) {
			this.error(`No release group or package found using name '${lookupName}'.`, { exit: 1 });
		}

		const filterOptions = parsePackageFilterFlags(this.flags);
		const packageList = await pnpmList(rgOrPackage.repoPath);
		const filteredPackages = await filterPackages(packageList, filterOptions);
		const filtered = filteredPackages
			.reverse()
			.filter((item): item is ListItem => {
				const config = context.flubConfig?.policy?.packageNames;
				if (config === undefined) {
					// exits the process
					this.error(`No package name policy config found.`);
				}

				if (feed === undefined) {
					return true;
				}

				const result = packagePublishesToFeed(item.name, config, feed);
				return result;
			})
			.map((item) => {
				// pnpm returns absolute paths, but repo relative is more useful
				item.path = context.repo.relativeToRepo(item.path);
				item.tarball = getTarballName(item.name);

				// Set the tarball name if the tarball flag is set
				if (tarball === true) {
					item.name = item.tarball;
				}
				return item;
			});

		const output = filtered.map((details) => details.name).join("\n");
		await this.writeOutput(output, outFile);

		// For JSON output
		return filtered;
	}

	private async outputSinglePackage(pkg: Package): Promise<ListItem> {
		const output = this.flags.tarball ? getTarballName(pkg.name) : pkg.name;

		await this.writeOutput(output, this.flags.outFile);
		const item: ListItem = {
			name: pkg.name,
			version: pkg.version,
			path: pkg.directory,
			private: pkg.private,
			tarball: getTarballName(pkg.packageJson),
		};
		return item;
	}

	private async writeOutput(output: string, outFile?: string): Promise<void> {
		if (outFile === undefined) {
			this.log(output);
		} else {
			mkdirpSync(path.dirname(outFile));
			writeFileSync(outFile, output);
		}
	}
}
