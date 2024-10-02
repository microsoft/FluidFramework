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
import { Workspace } from "./workspace.js";
import { loadWorkspacesFromLegacyConfig } from "./workspaceCompat.js";

export class FluidRepo implements IFluidRepo {
	// public readonly root: string;
	//
	public constructor(public readonly root: string) {
		const config = getFluidRepoLayout(this.root);

		if (config.repoLayout === undefined) {
			if (config.repoPackages === undefined) {
				throw new Error(`Can't find configuration.`);
			} else {
				console.warn(`The repoPackages setting is deprecated. Use repoLayout instead.`);
				this._workspaces = loadWorkspacesFromLegacyConfig(config.repoPackages, this.root);
			}
		} else {
			this._workspaces = new Map<WorkspaceName, IWorkspace>(
				Object.entries(config.repoLayout.workspaces).map((entry) => {
					const name = entry[0] as WorkspaceName;
					const definition = entry[1];
					const ws = Workspace.load(name, definition, this.root);
					return [name, ws];
				}),
			);
		}

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

	/**
	 * Transforms an absolute path to a path relative to the repo root.
	 *
	 * @param p - The path to make relative to the repo root.
	 * @returns the relative path.
	 */
	public relativeToRepo(p: string): string {
		// Replace \ in result with / in case OS is Windows.
		return path.relative(this.root, p).replace(/\\/g, "/");
	}

	public reload(): void {
		this.workspaces.forEach((ws) => ws.reload());
	}
}

export function loadFluidRepo(root: string): IFluidRepo {
	return new FluidRepo(root);
}
