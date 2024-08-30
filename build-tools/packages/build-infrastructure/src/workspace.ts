/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { getPackagesSync } from "@manypkg/get-packages";

import type { ReleaseGroupDefinition, WorkspaceDefinition } from "./config.js";
import { loadPackageFromWorkspaceDefinition } from "./package.js";
import { ReleaseGroup } from "./releaseGroup.js";
import type {
	IPackage,
	IReleaseGroup,
	IWorkspace,
	PackageManager,
	ReleaseGroupName,
	WorkspaceName,
} from "./types.js";
import { findGitRoot } from "./utils.js";

export class Workspace implements IWorkspace {
	public readonly name: WorkspaceName;
	public readonly releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	public readonly rootPackage: IPackage;
	public readonly packages: IPackage[];

	/**
	 * Absolute path to the root of the workspace.
	 */
	public readonly directory: string;

	private constructor(
		name: string,
		// public readonly directory: string,
		// public readonly releaseGroups: Map<ReleaseGroupName, IReleaseGroup>,
		// releaseGroupDefinition: Record<string, string>
		definition: WorkspaceDefinition,
	) {
		this.name = name as WorkspaceName;
		const repoRoot = findGitRoot();
		this.directory = path.resolve(repoRoot, definition.directory);

		let packageManager: PackageManager;

		const {
			tool,
			packages: foundPackages,
			rootPackage: foundRootPackage,
			rootDir: foundRoot,
		} = getPackagesSync(this.directory);
		if (foundRoot !== this.directory) {
			// This is a sanity check. directory is the path passed in when creating the Workspace object, while rootDir is
			// the dir that manypkg found. They should be the same.
			throw new Error(
				`The root dir found by manypkg, '${foundRoot}', does not match the configured directory '${this.directory}'`,
			);
		}

		if (foundRootPackage === undefined) {
			throw new Error(`No root package found for workspace in '${foundRoot}'`);
		}

		switch (tool.type) {
			case "npm":
			case "pnpm":
			case "yarn":
				packageManager = tool.type;
				break;
			default:
				throw new Error(`Unknown package manager ${tool.type}`);
		}
		// if (packages.length === 1 && packages[0]?.dir === directory) {
		// 	// this is a independent package
		// 	return undefined;
		// }

		// filter out the root package
		const filtered = foundPackages.filter((pkg) => pkg.relativeDir !== ".");

		// Load IPackages for all packages in the workspace except the root
		this.packages = filtered.map((pkg) =>
			loadPackageFromWorkspaceDefinition(
				path.join(pkg.dir, "package.json"),
				packageManager,
				/* isWorkspaceRoot */ false,
				definition,
			),
		);

		// Load the workspace root IPackage
		this.rootPackage = loadPackageFromWorkspaceDefinition(
			path.join(foundRootPackage.dir, "package.json"),
			packageManager,
			/* isWorkspaceRoot */ true,
			definition,
		);

		// Add the root package to the list of packages
		this.packages.unshift(this.rootPackage);

		const rGroupDefinitions: Map<ReleaseGroupName, ReleaseGroupDefinition> =
			definition.releaseGroups === undefined
				? new Map()
				: new Map(
						Object.entries(definition.releaseGroups).map((entry) => {
							const [name, group] = entry;
							return [name as ReleaseGroupName, group];
						}),
					);

		this.releaseGroups = new Map();
		for (const [groupName, def] of rGroupDefinitions) {
			this.releaseGroups.set(groupName, new ReleaseGroup(groupName, def, this.packages));
		}

		// sanity check - make sure that all packages are in a release group.
		const noGroup = new Set(this.packages.map((p) => p.name));
		for (const group of this.releaseGroups.values()) {
			for (const pkg of group.packages) {
				noGroup.delete(pkg.name);
			}
		}

		if (noGroup.size > 0) {
			const packageList = [...noGroup].join("\n");
			const message = `Found packages in the ${name} workspace that are not in any release groups. Check your config.\n${packageList}`;
			throw new Error(message);
		}
	}

	// private loadPackages() {

	// }

	public static load(name: string, definition: WorkspaceDefinition): IWorkspace {
		const workspace = new Workspace(name, definition);
		return workspace;
	}
}

// type PackageKinds = "WorkspaceRoot" | "ReleaseGroupMember" | "ReleaseGroupRoot";
