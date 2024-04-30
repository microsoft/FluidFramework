/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import sortPackageJson from "sort-package-json";
import { table } from "table";

import type { Package } from "@fluidframework/build-tools";
import { BaseCommand } from "../base";
import { releaseGroupFlag } from "../flags";
// eslint-disable-next-line import/no-deprecated
import { isMonoRepoKind } from "../library";

interface ColumnInfo {
	/**
	 * Camel-cased column name.
	 */
	name: string;

	/**
	 * Function to extract column value from a Package instance.
	 */
	fn: (pkg: Package) => string;
}

/**
 * Map lowercased column name to corresponding ColumnInfo.
 */
const nameToColumnInfo: Record<string, ColumnInfo> = {
	releasegroup: { name: "releaseGroup", fn: (pkg: Package) => pkg.monoRepo?.kind ?? "n/a" },
	name: { name: "name", fn: (pkg: Package) => pkg.name },
	private: {
		name: "private",
		fn: (pkg: Package) => (pkg.packageJson.private === true ? "-private-" : ""),
	},
	version: {
		name: "version",
		fn: (pkg: Package) => (pkg.monoRepo ? pkg.monoRepo.version : pkg.version),
	},
	path: {
		name: "path",
		fn: (pkg: Package) => pkg.directory,
	},
};

/**
 * The root `info` command.
 */
export default class InfoCommand extends BaseCommand<typeof InfoCommand> {
	static readonly description = "Get info about the repo, release groups, and packages.";

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: false,
		}),
		columns: Flags.string({
			char: "c",
			default: "ReleaseGroup,Name,Private,Version",
			description: "Columns to include in report.",
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

	async run(): Promise<Record<string, string>[]> {
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

		const columns = flags.columns.split(",").map((value) => value.trim().toLowerCase());

		// Initialize 'tableData' with Pascal cased column names.
		const tableData = [
			columns.map((column) => {
				const { name } = nameToColumnInfo[column];
				return name.charAt(0).toUpperCase() + name.slice(1);
			}),
		];

		const jsonData: Record<string, string>[] = [];

		for (const pkg of packages) {
			const tableRow = [];
			const jsonRow: Record<string, string> = {};

			for (const column of columns) {
				const info = nameToColumnInfo[column];
				const { name } = info;
				const value = info.fn(pkg);

				tableRow.push(value);
				jsonRow[name] = value;
			}

			tableData.push(tableRow);
			jsonData.push(jsonRow);
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
