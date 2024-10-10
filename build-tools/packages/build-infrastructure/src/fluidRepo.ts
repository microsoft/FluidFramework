/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { type SimpleGit, simpleGit } from "simple-git";

import { getFluidRepoLayout } from "./config.js";
import { NotInGitRepository } from "./errors.js";
import {
	type IFluidRepo,
	type IPackage,
	type IReleaseGroup,
	type IWorkspace,
	type PackageName,
	type ReleaseGroupName,
	type WorkspaceName,
} from "./types.js";
import { findGitRootSync } from "./utils.js";
import { Workspace } from "./workspace.js";
import { loadWorkspacesFromLegacyConfig } from "./workspaceCompat.js";

export class FluidRepo implements IFluidRepo {
	/**
	 * The absolute path to the root of the FluidRepo. This is the path where the config file is located.
	 */
	public readonly root: string;

	/**
	 * @param searchPath - The path that should be searched for a repo layout config file.
	 * @param gitRepository - A SimpleGit instance rooted in the root of the Git repository housing the FluidRepo. This
	 * should be set to false if the FluidRepo is not within a Git repository.
	 */
	public constructor(
		searchPath: string,
		public readonly upstreamRemotePartialUrl?: string,
	) {
		const { config, configFile } = getFluidRepoLayout(searchPath);
		this.root = path.resolve(path.dirname(configFile));

		// Check for the repoLayout config first
		if (config.repoLayout === undefined) {
			// If there's no `repoLayout` _and_ no `repoPackages`, then we need to error since there's no loadable config.
			if (config.repoPackages === undefined) {
				throw new Error(`Can't find configuration.`);
			} else {
				console.warn(
					`The repoPackages setting is deprecated and will no longer be read in a future version. Use repoLayout instead.`,
				);
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
	public get workspaces(): Map<WorkspaceName, IWorkspace> {
		return this._workspaces;
	}

	private readonly _releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	public get releaseGroups(): Map<ReleaseGroupName, IReleaseGroup> {
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
	 * Transforms an absolute path to a path relative to the FluidRepo root.
	 *
	 * @param p - The path to make relative to the FluidRepo root.
	 * @returns the relative path.
	 */
	public relativeToRepo(p: string): string {
		// Replace \ in result with / in case OS is Windows.
		return path.relative(this.root, p).replace(/\\/g, "/");
	}

	public reload(): void {
		for (const ws of this.workspaces.values()) {
			ws.reload();
		}
	}

	private gitRepository: SimpleGit | undefined;
	private _checkedForGitRepo = false;

	public async getGitRepository(): Promise<Readonly<SimpleGit>> {
		if (this.gitRepository !== undefined) {
			return this.gitRepository;
		}

		if (this._checkedForGitRepo === false) {
			this._checkedForGitRepo = true;
			// Check if the path is within a Git repo by trying to find the path to the Git repo root. If not within a git
			// repo, this call will throw a `NotInGitRepository` error.
			const gitRoot = findGitRootSync(this.root);
			this.gitRepository = simpleGit(gitRoot);
			return this.gitRepository;
		}

		throw new NotInGitRepository(this.root);
	}

	public getPackageReleaseGroup(pkg: Readonly<IPackage>): Readonly<IReleaseGroup> {
		const found = this.releaseGroups.get(pkg.releaseGroup);
		if (found === undefined) {
			throw new Error(`Cannot find release group for package: ${pkg}`);
		}

		return found;
	}

	public getPackageWorkspace(pkg: Readonly<IPackage>): Readonly<IWorkspace> {
		const releaseGroup = this.getPackageReleaseGroup(pkg);
		const found = releaseGroup.workspace;
		return found;
	}
}

/**
 * Searches for a Fluid repo config file and loads the repo layout from the config if found.
 *
 * @param searchPath - The path to start searching for a Fluid repo config.
 * @param upstreamRemotePartialUrl - A partial URL to the upstream repo. This is used to find the local git remote that
 * corresponds to the upstream repo.
 * @returns The loaded Fluid repo.
 */
export function loadFluidRepo(
	searchPath: string,
	upstreamRemotePartialUrl?: string,
): IFluidRepo {
	const repo: IFluidRepo = new FluidRepo(searchPath, upstreamRemotePartialUrl);
	return repo;
}
