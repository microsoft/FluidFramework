/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import colors from "picocolors";

import { getAllDependenciesInRepo, loadFluidRepo } from "../fluidRepo.js";
import type { IFluidRepo } from "../types.js";

/**
 * This command is intended for testing and debugging use only.
 */
export class ListCommand extends Command {
	static override description =
		"List objects in the Fluid repo, like release groups, workspaces, and packages. USED FOR TESTING ONLY.";

	static override flags = {
		path: Flags.directory({
			description: "Path to start searching for the Fluid repo.",
			default: ".",
		}),
		full: Flags.boolean({
			description: "Output the full report.",
		}),
	} as const;

	async run(): Promise<void> {
		const { flags } = await this.parse(ListCommand);
		const { path: searchPath, full } = flags;

		// load the Fluid repo
		const repo = loadFluidRepo(searchPath);
		const _ = full ? await this.logFullReport(repo) : await this.logCompactReport(repo);
	}

	private async logFullReport(repo: IFluidRepo): Promise<void> {
		this.logIndent(colors.underline("Repository layout"));
		for (const workspace of repo.workspaces.values()) {
			this.log();
			this.logIndent(colors.blue(workspace.toString()), 1);
			for (const releaseGroup of workspace.releaseGroups.values()) {
				this.log();
				this.logIndent(colors.green(releaseGroup.toString()), 2);
				this.logIndent(colors.bold("Packages"), 3);
				for (const pkg of releaseGroup.packages) {
					const pkgMessage = colors.white(
						`${pkg.name}${pkg.isReleaseGroupRoot ? colors.bold(" (root)") : ""}`,
					);
					this.logIndent(pkgMessage, 4);
				}

				const { releaseGroups, workspaces } = getAllDependenciesInRepo(
					repo,
					releaseGroup.packages,
				);
				if (releaseGroups.length > 0 || workspaces.length > 0) {
					this.log();
					this.logIndent(colors.bold("Depends on:"), 3);
					for (const depReleaseGroup of releaseGroups) {
						this.logIndent(depReleaseGroup.toString(), 4);
					}
					for (const depWorkspace of workspaces) {
						this.logIndent(depWorkspace.toString(), 4);
					}
				}
			}
		}
	}

	private async logCompactReport(repo: IFluidRepo): Promise<void> {
		this.logIndent(colors.underline("Repository layout"));
		for (const workspace of repo.workspaces.values()) {
			this.log();
			this.logIndent(colors.blue(workspace.toString()), 1);
			this.logIndent(colors.bold("Packages"), 2);
			for (const pkg of workspace.packages) {
				const pkgMessage = colors.white(
					`${pkg.isReleaseGroupRoot ? colors.bold("(root) ") : ""}${pkg.name} ${colors.black(colors.bgGreen(pkg.releaseGroup))}`,
				);
				this.logIndent(pkgMessage, 3);
			}
		}
	}

	private logIndent(message: string, indent: number = 0): void {
		const spaces = " ".repeat(2 * indent);
		this.log(`${spaces}${message}`);
	}
}
