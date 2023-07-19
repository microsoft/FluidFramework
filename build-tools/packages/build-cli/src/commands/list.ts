/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import execa from "execa";

import { BaseCommand } from "../base";
import { filterPackages, parsePackageFilterFlags } from "../filter";
import { filterFlags, releaseGroupFlag } from "../flags";
import { PnpmListEntry, pnpmList } from "../pnpm";

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
		tarball: Flags.boolean({
			description:
				"Return packed tarball names (without extension) instead of package names. @-signs will be removed from the name, and slashes are replaced with dashes.",
			default: false,
		}),
	};

	public async run(): Promise<PnpmListEntry[]> {
		const context = await this.getContext();
		const releaseGroup = context.repo.releaseGroups.get(this.flags.releaseGroup);
		if (releaseGroup === undefined) {
			this.error(`Can't find release group: ${this.flags.releaseGroup}`, { exit: 1 });
		}

		const filterOptions = parsePackageFilterFlags(this.flags);
		const pnpmListResults = await pnpmList(releaseGroup.repoPath);
		const filtered = filterPackages(pnpmListResults, filterOptions)
			.reverse()
			.map((item) => {
				// pnpm returns absolute paths, but repo relative is more useful
				item.path = context.repo.relativeToRepo(item.path);

				// Calculate and set the tarball name if the tarball flag is set
				item.name =
					this.flags.tarball === true
						? item.name.replaceAll("@", "").replaceAll("/", "-")
						: item.name;
				return item;
			});

		for (const details of filtered) {
			this.log(details.name);
		}

		return filtered;
	}
}
