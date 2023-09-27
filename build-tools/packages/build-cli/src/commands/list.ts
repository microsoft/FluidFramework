/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { BaseCommand } from "../base";
import { filterPackages, parsePackageFilterFlags } from "../filter";
import { filterFlags, releaseGroupFlag } from "../flags";
import { PnpmListEntry, pnpmList } from "../pnpm";
import {
	packageMayChooseToPublishToInternalFeedOnly,
	packageMayChooseToPublishToNPM,
	packageMustPublishToInternalFeedOnly,
	packageMustPublishToNPM,
	// eslint-disable-next-line import/no-internal-modules -- the policy-related stuff will eventually be moved into this package
} from "@fluidframework/build-tools/dist/repoPolicyCheck/handlers/npmPackages";

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
	static description = `List packages in a release group in topological order.`;
	static enableJsonFlag = true;

	static flags = {
		releaseGroup: releaseGroupFlag({ required: true }),
		...filterFlags,
		feed: Flags.string({
			description:
				"Filter the resulting packages to those that should be published to a particular npm feed. Use 'official' for public npm.",
			options: ["official", "internal", "internal-test"],
			helpGroup: "PACKAGE FILTER",
			required: false,
		}),
		tarball: Flags.boolean({
			description:
				"Return packed tarball names (without extension) instead of package names. @-signs will be removed from the name, and slashes are replaced with dashes.",
			default: false,
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

				const official =
					packageMustPublishToNPM(item.name, config) ||
					packageMayChooseToPublishToNPM(item.name, config);

				const internal =
					packageMustPublishToInternalFeedOnly(item.name, config) ||
					packageMayChooseToPublishToInternalFeedOnly(item.name, config);

				switch (this.flags.feed) {
					case "official": {
						return official;
					}

					case "internal":
					case "internal-test": {
						return official || internal;
					}

					default: {
						return true;
					}
				}
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

		for (const details of filtered) {
			this.log(details.name);
		}

		return filtered;
	}
}
