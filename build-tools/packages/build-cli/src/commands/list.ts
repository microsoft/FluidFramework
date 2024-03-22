/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFileSync } from "node:fs";
import { Package, PackageNamePolicyConfig } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";

import { BaseCommand } from "../base";
import { filterPackages, parsePackageFilterFlags } from "../filter";
import { filterFlags, releaseGroupFlag } from "../flags";
import { type Feed, feeds, isFeed, packagePublishesToFeed } from "../library";
import { PnpmListEntry, pnpmList } from "../pnpm";

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

	static readonly flags = {
		releaseGroup: releaseGroupFlag({ required: true }),
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
		const context = await this.getContext();
		const releaseGroup = context.repo.releaseGroups.get(this.flags.releaseGroup);

		if (releaseGroup === undefined) {
			// exits the process
			this.error(`Can't find release group: ${this.flags.releaseGroup}`, { exit: 1 });
		}

		const filterOptions = parsePackageFilterFlags(this.flags);
		const packageList = await pnpmList(releaseGroup.repoPath);
		const filtered = filterPackages(packageList, filterOptions)
			.reverse()
			.filter((item): item is ListItem => {
				const config = context.rootFluidBuildConfig?.policy?.packageNames;
				if (config === undefined) {
					// exits the process
					this.error(`No fluid-build package name policy config found.`);
				}

				if (this.flags.feed === undefined) {
					return true;
				}

				const result = packagePublishesToFeed(item.name, config, this.flags.feed);
				return result;
			})
			.map((item) => {
				// pnpm returns absolute paths, but repo relative is more useful
				item.path = context.repo.relativeToRepo(item.path);
				item.tarball = item.name.replaceAll("@", "").replaceAll("/", "-");

				// Set the tarball name if the tarball flag is set
				if (this.flags.tarball === true) {
					item.name = item.tarball;
				}
				return item;
			});

		const output = filtered.map((details) => details.name).join("\n");

		if (this.flags.outFile === undefined) {
			this.log(output);
		} else {
			writeFileSync(this.flags.outFile, output);
		}

		return filtered;
	}
}

/**
 * Calculates the packages that should be published to a feed and returns a map of Feed to the packages that should be
 * published there.
 */
export function FeedsForPackages(
	packages: Package[],
	config: PackageNamePolicyConfig,
): Map<Feed, Package[]> {
	const mapping = new Map<Feed, Package[]>();
	for (const pkg of packages) {
		for (const feed of feeds) {
			let pkgList = mapping.get(feed);
			if (pkgList === undefined) {
				pkgList = [];
			}

			if (!mapping.has(feed)) {
				mapping.set(feed, []);
			}

			if (packagePublishesToFeed(pkg.name, config, feed)) {
				mapping.get(feed)?.push(pkg);
			}
		}
	}
	return mapping;
}
