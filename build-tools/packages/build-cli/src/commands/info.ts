/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package } from "@fluidframework/build-tools";
import sortPackageJson from "sort-package-json";
import { table } from "table";
import { PackageCommand } from "../BasePackageCommand";
import { PackageWithKind } from "../filter";
// eslint-disable-next-line import/no-deprecated
import type { MonoRepoKind, PackageVersionList } from "../library";

/**
 * The root `info` command.
 */
export default class InfoCommand extends PackageCommand<typeof InfoCommand> {
	static description = "Get info about the repo, release groups, and packages.";

	static enableJsonFlag = true;
	protected selectAllByDefault = true;

	protected async processPackage(pkg: Package): Promise<void> {
		// do nothing
	}

	protected async processPackages(packages: PackageWithKind[]): Promise<void> {
		// do nothing
	}

	async run(): Promise<PackageVersionList> {
		await super.run();

		const packages = this.filteredPackages;
		if (packages === undefined || packages.length === 0) {
			this.error(`No packages found.`, { exit: 1 });
		}

		// eslint-disable-next-line import/no-deprecated
		const tableData: (string | MonoRepoKind | undefined)[][] = [
			["Release group", "Name", "Private", "Kind", "Version"],
		];
		const jsonData: PackageVersionList = {};
		for (const pkg of packages) {
			const version = pkg.monoRepo ? pkg.monoRepo.version : pkg.version;
			tableData.push([
				pkg.monoRepo?.kind ?? "n/a",
				pkg.name,
				pkg.packageJson.private === true ? "-private-" : "",
				pkg.kind,
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
