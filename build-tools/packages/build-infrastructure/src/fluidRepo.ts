/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { getFluidRepoLayout } from "./config.js";
import type {
	IFluidRepo,
	IPackage,
	IReleaseGroup,
	IWorkspace,
	PackageName,
	ReleaseGroupName,
	WorkspaceName,
} from "./types.js";
import { findGitRoot } from "./utils.js";
import { Workspace } from "./workspace.js";

export class FluidRepo implements IFluidRepo {
	public readonly root: string;

	public constructor(root?: string) {
		this.root = root === undefined ? findGitRoot() : path.resolve(root);
		const config = getFluidRepoLayout(this.root);

		// if (config.repoPackages !== undefined) {
		// 	// TODO: Warning that this setting is deprecated.
		// }

		if (config.repoLayout === undefined) {
			// TODO: load using old settings
			throw new Error("old settings");
		}

		this._workspaces = new Map<WorkspaceName, IWorkspace>(
			Object.entries(config.repoLayout.workspaces).map((entry) => {
				const name = entry[0] as WorkspaceName;
				const definition = entry[1];
				const ws = Workspace.load(name, definition);
				return [name, ws];
			}),
		);

		const releaseGroups = new Map<ReleaseGroupName, IReleaseGroup>();
		for (const ws of this.workspaces.values()) {
			for (const [rgName, rg] of ws.releaseGroups) {
				if (releaseGroups.has(rgName)) {
					throw new Error(`Duplicate release group: ${rgName}`);
				}
				releaseGroups.set(rgName, rg);
			}
		}
		this._releaseGroups = releaseGroups;
	}

	private readonly _workspaces: Map<WorkspaceName, IWorkspace>;
	public get workspaces() {
		return this._workspaces;
	}

	private readonly _releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	public get releaseGroups() {
		return this._releaseGroups;
	}

	// public get packages(): IPackage[] {
	// 	const pkgs: IPackage[] = [];
	// 	for (const ws of this.workspaces.values()) {
	// 		pkgs.push(ws.rootPackage, ...ws.packages);
	// 	}

	// 	return pkgs;
	// }

	public get packages(): Map<PackageName, IPackage> {
		const pkgs: Map<PackageName, IPackage> = new Map();
		for (const ws of this.workspaces.values()) {
			for (const pkg of ws.packages) {
				if (pkgs.has(pkg.name)) {
					throw new Error(`Duplicate package: ${pkg.name}`);
				}

				pkgs.set(pkg.name, pkg);
			}
		}

		return pkgs;
	}
}

export function loadFluidRepo(root?: string): IFluidRepo {
	return new FluidRepo(root);
}
