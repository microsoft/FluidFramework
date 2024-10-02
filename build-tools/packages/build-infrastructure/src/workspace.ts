/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { getPackagesSync } from "@manypkg/get-packages";
import execa from "execa";

import type { ReleaseGroupDefinition, WorkspaceDefinition } from "./config.js";
import { loadPackageFromWorkspaceDefinition } from "./package.js";
import { PackageManager } from "./packageManagers.js";
import { ReleaseGroup } from "./releaseGroup.js";
import type {
	IPackage,
	IPackageManager,
	IReleaseGroup,
	IWorkspace,
	ReleaseGroupName,
	WorkspaceName,
} from "./types.js";

export class Workspace implements IWorkspace {
	public readonly name: WorkspaceName;
	public readonly releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	public readonly rootPackage: IPackage;
	public readonly packages: IPackage[];

	/**
	 * Absolute path to the root of the workspace.
	 */
	public readonly directory: string;

	private readonly packageManager: IPackageManager;

	private constructor(
		name: string,
		definition: WorkspaceDefinition,
		public readonly root: string,
	) {
		this.name = name as WorkspaceName;
		// const repoRoot = findGitRoot();
		this.directory = path.resolve(root, definition.directory);

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
				this.packageManager = PackageManager.load(tool.type);
				break;
			default:
				throw new Error(`Unknown package manager ${tool.type}`);
		}

		this.packages = [];
		for (const pkg of foundPackages) {
			const loadedPackage = loadPackageFromWorkspaceDefinition(
				path.join(pkg.dir, "package.json"),
				this.packageManager,
				/* isWorkspaceRoot */ foundPackages.length === 1,
				definition,
			);
			this.packages.push(loadedPackage);
		}

		// Load the workspace root IPackage; only do this if more than one package was found in the workspace; otherwise the
		// single package loaded will be the workspace root.
		if (foundPackages.length > 1) {
			this.rootPackage = loadPackageFromWorkspaceDefinition(
				path.join(this.directory, "package.json"),
				this.packageManager,
				/* isWorkspaceRoot */ true,
				definition,
			);

			// Prepend the root package to the list of packages
			this.packages.unshift(this.rootPackage);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.rootPackage = this.packages[0]!;
		}

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
			this.releaseGroups.set(groupName, new ReleaseGroup(groupName, def, this));
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

	public async checkInstall() {
		let succeeded = true;
		for (const buildPackage of this.packages) {
			if (!(await buildPackage.checkInstall())) {
				succeeded = false;
			}
		}
		return succeeded;
	}

	public async install(updateLockfile: boolean): Promise<boolean> {
		const command = this.packageManager.installCommand(updateLockfile);
		const output = await execa(this.packageManager.name, command.split(" "), {
			cwd: this.directory,
		});
		console.debug(output);
		return true;
	}

	public reload(): void {
		this.packages.forEach((pkg) => pkg.reload());
	}

	public static load(name: string, definition: WorkspaceDefinition, root: string): IWorkspace {
		const workspace = new Workspace(name, definition, root);
		return workspace;
	}
}
