/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { InterdependencyRange } from "@fluid-tools/version-tools";
import * as semver from "semver";
import { type SimpleGit, simpleGit } from "simple-git";

import { type BuildProjectConfig, getBuildProjectConfig } from "./config.js";
import { NotInGitRepository } from "./errors.js";
import { findGitRootSync } from "./git.js";
import {
	type IBuildProject,
	type IPackage,
	type IReleaseGroup,
	type IWorkspace,
	type PackageName,
	type ReleaseGroupName,
	type WorkspaceName,
} from "./types.js";
import { Workspace } from "./workspace.js";
import { loadWorkspacesFromLegacyConfig } from "./workspaceCompat.js";

/**
 * {@inheritDoc IBuildProject}
 */
export class BuildProject<P extends IPackage> implements IBuildProject<P> {
	/**
	 * The absolute path to the root of the build project. This is the path where the config file is located.
	 */
	public readonly root: string;

	/**
	 * {@inheritDoc IBuildProject.configuration}
	 */
	public readonly configuration: BuildProjectConfig;

	/**
	 * The absolute path to the config file.
	 */
	protected readonly configFilePath: string;

	/**
	 * @param searchPath - The path that should be searched for a BuildProject config file.
	 * @param gitRepository - A SimpleGit instance rooted in the root of the Git repository housing the BuildProject. This
	 * should be set to false if the BuildProject is not within a Git repository.
	 */
	public constructor(
		searchPath: string,

		/**
		 * {@inheritDoc IBuildProject.upstreamRemotePartialUrl}
		 */
		public readonly upstreamRemotePartialUrl?: string,
	) {
		const { config, configFilePath } = getBuildProjectConfig(searchPath);
		this.root = path.resolve(path.dirname(configFilePath));
		this.configuration = config;
		this.configFilePath = configFilePath;

		// Check for the buildProject config first
		if (config.buildProject === undefined) {
			// If there's no `buildProject` _and_ no `repoPackages`, then we need to error since there's no loadable config.
			if (config.repoPackages === undefined) {
				throw new Error(`Can't find configuration.`);
			} else {
				console.warn(
					`The repoPackages setting is deprecated and will no longer be read in a future version. Use buildProject instead.`,
				);
				this._workspaces = loadWorkspacesFromLegacyConfig(config.repoPackages, this);
			}
		} else {
			this._workspaces = new Map<WorkspaceName, IWorkspace>(
				Object.entries(config.buildProject.workspaces).map((entry) => {
					const name = entry[0] as WorkspaceName;
					const definition = entry[1];
					const ws = Workspace.load(name, definition, this.root, this);
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

	/**
	 * {@inheritDoc IBuildProject.workspaces}
	 */
	public get workspaces(): Map<WorkspaceName, IWorkspace> {
		return this._workspaces;
	}

	private readonly _releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;

	/**
	 * {@inheritDoc IBuildProject.releaseGroups}
	 */
	public get releaseGroups(): Map<ReleaseGroupName, IReleaseGroup> {
		return this._releaseGroups;
	}

	/**
	 * {@inheritDoc IBuildProject.packages}
	 */
	public get packages(): Map<PackageName, P> {
		const pkgs: Map<PackageName, P> = new Map();
		for (const ws of this.workspaces.values()) {
			for (const pkg of ws.packages) {
				if (pkgs.has(pkg.name)) {
					throw new Error(`Duplicate package: ${pkg.name}`);
				}

				pkgs.set(pkg.name, pkg as P);
			}
		}

		return pkgs;
	}

	/**
	 * {@inheritDoc IBuildProject.relativeToRepo}
	 */
	public relativeToRepo(p: string): string {
		// Replace \ in result with / in case OS is Windows.
		return path.relative(this.root, p).replace(/\\/g, "/");
	}

	/**
	 * Reload the BuildProject by calling `reload` on each workspace in the repository.
	 */
	public reload(): void {
		for (const ws of this.workspaces.values()) {
			ws.reload();
		}
	}

	private gitRepository: SimpleGit | undefined;
	private _checkedForGitRepo = false;

	/**
	 * {@inheritDoc IBuildProject.getGitRepository}
	 */
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

	/**
	 * {@inheritDoc IBuildProject.getPackageReleaseGroup}
	 */
	public getPackageReleaseGroup(pkg: Readonly<P>): Readonly<IReleaseGroup> {
		const found = this.releaseGroups.get(pkg.releaseGroup);
		if (found === undefined) {
			throw new Error(`Cannot find release group for package: ${pkg}`);
		}

		return found;
	}
}

/**
 * Searches for a BuildProject config file and loads the project from the config if found.
 *
 * @typeParam P - The type to use for Packages.
 * @param searchPath - The path to start searching for a BuildProject config.
 * @param upstreamRemotePartialUrl - A partial URL to the upstream repo. This is used to find the local git remote that
 * corresponds to the upstream repo.
 * @returns The loaded BuildProject.
 */
export function loadBuildProject<P extends IPackage>(
	searchPath: string,
	upstreamRemotePartialUrl?: string,
): IBuildProject<P> {
	const repo = new BuildProject<P>(searchPath, upstreamRemotePartialUrl);
	return repo;
}

/**
 * Returns an object containing all the packages, release groups, and workspaces that a given set of packages depends
 * on. This function only considers packages in the BuildProject repo.
 */
export function getAllDependencies(
	repo: IBuildProject,
	packages: IPackage[],
): { packages: IPackage[]; releaseGroups: IReleaseGroup[]; workspaces: IWorkspace[] } {
	const dependencyPackages: Set<IPackage> = new Set();
	const releaseGroups: Set<IReleaseGroup> = new Set();
	const workspaces: Set<IWorkspace> = new Set();

	for (const pkg of packages) {
		for (const { name } of pkg.combinedDependencies) {
			const depPackage = repo.packages.get(name);
			if (depPackage === undefined) {
				continue;
			}

			if (pkg.releaseGroup !== depPackage.releaseGroup) {
				dependencyPackages.add(depPackage);
				releaseGroups.add(repo.getPackageReleaseGroup(depPackage));

				if (pkg.workspace !== depPackage.workspace) {
					workspaces.add(depPackage.workspace);
				}
			}
		}
	}

	return {
		packages: [...dependencyPackages],
		releaseGroups: [...releaseGroups],
		workspaces: [...workspaces],
	};
}

/**
 * Sets the dependency range for a group of packages given a group of dependencies to update.
 * The changes are written to package.json. After the update, the packages are
 * reloaded so the in-memory data reflects the version changes.
 *
 * @param packagesToUpdate - A list of objects whose version should be updated.
 * @param dependencies - A list of objects that the packagesToUpdate depend on that should have updated ranges.
 * @param dependencyRange - The new version range to set for the packageToUpdate dependencies.
 */
export async function setDependencyRange<P extends IPackage>(
	packagesToUpdate: Iterable<P>,
	dependencies: Iterable<P>,
	dependencyRange: InterdependencyRange,
): Promise<void> {
	const dependencySet = new Set(Array.from(dependencies, (d) => d.name));
	// collect the "save" promises to resolve in parallel
	const savePromises: Promise<void>[] = [];

	for (const pkg of packagesToUpdate) {
		for (const { name: depName, depKind } of pkg.combinedDependencies) {
			if (dependencySet.has(depName)) {
				const depRange =
					typeof dependencyRange === "string"
						? dependencyRange
						: dependencyRange instanceof semver.SemVer
							? dependencyRange.version
							: undefined;

				// Check if depRange is defined
				if (depRange === undefined) {
					throw new Error(`Invalid dependency range: ${dependencyRange}`);
				}

				// Update the version in packageJson
				if (depKind === "prod" && pkg.packageJson.dependencies !== undefined) {
					pkg.packageJson.dependencies[depName] = depRange;
				} else if (depKind === "dev" && pkg.packageJson.devDependencies !== undefined) {
					pkg.packageJson.devDependencies[depName] = depRange;
				} else if (depKind === "peer" && pkg.packageJson.peerDependencies !== undefined) {
					pkg.packageJson.peerDependencies[depName] = depRange;
				}
			}
		}
		savePromises.push(pkg.savePackageJson());
	}
	await Promise.all(savePromises);

	// Reload all packages to refresh the in-memory data
	for (const pkg of packagesToUpdate) {
		pkg.reload();
	}
}
