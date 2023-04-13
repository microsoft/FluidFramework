/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { table } from "table";

import { MonoRepoKind, isMonoRepoKind } from "@fluidframework/build-tools";

import { BaseCommand } from "../base";
import { releaseGroupFlag } from "../flags";

/**
 * The root `info` command.
 */
export default class InfoCommand extends BaseCommand<typeof InfoCommand> {
	static description = "Get info about the repo, release groups, and packages.";

	static flags = {
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

	async run(): Promise<void> {
		const flags = this.flags;
		const context = await this.getContext();
		let packages =
			flags.releaseGroup !== undefined && isMonoRepoKind(flags.releaseGroup)
				? context.packagesInReleaseGroup(flags.releaseGroup)
				: [...context.fullPackageMap.values()];

		// Filter out private packages
		if (!flags.private) {
			packages = packages.filter((p) => p.packageJson.private !== true);
		}

		const data: (string | MonoRepoKind | undefined)[][] = [
			["Release group", "Name", "Private", "Version"],
		];
		for (const pkg of packages) {
			data.push([
				pkg.monoRepo?.kind ?? "n/a",
				pkg.name,
				pkg.packageJson.private ?? false ? "-private-" : "",
				pkg.monoRepo === undefined ? pkg.version : pkg.monoRepo.version,
			]);
		}

		const output = table(data, {
			columns: [{ alignment: "left" }, { alignment: "left" }, { alignment: "center" }],
			singleLine: true,
		});

		this.log(`\n${output}`);
		this.log(`Total package count: ${packages.length}`);
	}
}
