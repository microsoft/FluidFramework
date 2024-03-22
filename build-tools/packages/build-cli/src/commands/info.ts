/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import sortPackageJson from "sort-package-json";
import { table } from "table";

import { BaseCommand } from "../base";
import { releaseGroupFlag } from "../flags";
// eslint-disable-next-line import/no-deprecated
import { MonoRepoKind, PackageVersionList, isMonoRepoKind } from "../library";

/**
 * The root `info` command.
 */
export default class InfoCommand extends BaseCommand<typeof InfoCommand> {
	static readonly description = "Get info about the repo, release groups, and packages.";

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: false,
		}),
		private: Flags.boolean({
			allowNo: true,
			char: "p",
			default: true,
			description: "Include private packages (default true).",
			required: false,
		}),
		...BaseCommand.flags,
	};

	static readonly enableJsonFlag: boolean = true;

	async run(): Promise<PackageVersionList> {
		const { flags } = this;
		const context = await this.getContext();
		let packages =
			// eslint-disable-next-line import/no-deprecated
			flags.releaseGroup !== undefined && isMonoRepoKind(flags.releaseGroup)
				? context.packagesInReleaseGroup(flags.releaseGroup)
				: [...context.fullPackageMap.values()];

		// Filter out private packages
		if (!flags.private) {
			packages = packages.filter((p) => p.packageJson.private !== true);
		}

		// eslint-disable-next-line import/no-deprecated
		const tableData: (string | MonoRepoKind | undefined)[][] = [
			["Release group", "Name", "Private", "Version"],
		];
		const jsonData: PackageVersionList = {};
		for (const pkg of packages) {
			const version = pkg.monoRepo ? pkg.monoRepo.version : pkg.version;
			tableData.push([
				pkg.monoRepo?.kind ?? "n/a",
				pkg.name,
				pkg.packageJson.private === true ? "-private-" : "",
				version,
			]);
			jsonData[pkg.name] = version;
		}

		const output = table(tableData, {
			columns: [{ alignment: "left" }, { alignment: "left" }, { alignment: "center" }],
			singleLine: true,
		});

		this.log(`\n${output}`);
		this.log(`Total package count: ${packages.length}`);
		return sortPackageJson(jsonData);
	}
}
