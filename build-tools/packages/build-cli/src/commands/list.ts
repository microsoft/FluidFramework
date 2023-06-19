/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import execa from "execa";

import { BaseCommand } from "../base";
import { filterFlags, releaseGroupFlag } from "../flags";
import {
	filterPackages,
	parsePackageFilterFlags,
	parsePackageSelectionFlags,
	selectAndFilterPackages,
} from "../filter";
import { Package } from "@fluidframework/build-tools";

interface ListEntry {
	name: string;
	version: string;
	path: string;
	private: boolean;
}

export default class ListCommand extends BaseCommand<typeof ListCommand> {
	static description = `List packages in a release group in topological order.`;
	static enableJsonFlag = true;

	static flags = {
		releaseGroup: releaseGroupFlag({ required: true }),
		// private: Flags.boolean({
		// 	description: "Only include private packages (or non-private packages for --no-private)",
		// 	allowNo: true,
		// 	default: undefined,
		// }),
		...filterFlags,
		tarball: Flags.boolean({
			description:
				"Return packed tarball names (without extension) instead of package names. @-signs will be removed from the name, and slashes are replaced with dashes.",
			default: false,
		}),
	};

	public async run(): Promise<ListEntry[]> {
		const context = await this.getContext();
		const releaseGroup = context.repo.releaseGroups.get(this.flags.releaseGroup);
		if (releaseGroup === undefined) {
			this.error(`Can't find release group: ${this.flags.releaseGroup}`, { exit: 1 });
		}

		const filterOptions = parsePackageFilterFlags(this.flags);
		const raw = await execa(`pnpm`, [`-r`, `list`, `--depth=-1`, `--json`], {
			cwd: releaseGroup.repoPath,
		});

		if (raw.stdout === undefined) {
			this.error(`No output from pnpm list.`, { exit: 1 });
		}

		const parsed: ListEntry[] = JSON.parse(raw.stdout);
		const filtered = filterPackages(parsed, filterOptions)
			.reverse()
			.map((item) => {
				// pnpm returns absolute paths, but repo relative is more useful
				item.path = context.repo.relativeToRepo(item.path);

				// Calculate and set the tarball name if the tarball flag is set
				item.name = this.flags.tarball
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
