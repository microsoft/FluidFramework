/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import globby from "globby";

import type {
	// eslint-disable-next-line import/no-deprecated -- back-compat code
	IFluidBuildDir,
	// eslint-disable-next-line import/no-deprecated -- back-compat code
	IFluidBuildDirs,
	ReleaseGroupDefinition,
	WorkspaceDefinition,
} from "./config.js";
import type { IFluidRepo, IWorkspace, WorkspaceName } from "./types.js";
import { Workspace } from "./workspace.js";

/**
 * Loads workspaces based on the "legacy" config -- the former repoPackages section of the fluid-build config.
 *
 * **ONLY INTENDED FOR BACK-COMPAT.**
 *
 * @param entry - The config entry.
 * @param fluidRepo - The Fluid repo the workspace belongs to.
 */
export function loadWorkspacesFromLegacyConfig(
	// eslint-disable-next-line import/no-deprecated -- back-compat code
	config: IFluidBuildDirs,
	fluidRepo: IFluidRepo,
): Map<WorkspaceName, IWorkspace> {
	const workspaces: Map<WorkspaceName, IWorkspace> = new Map();

	// Iterate over the entries and create synthetic workspace definitions for them, then load the workspaces.
	for (const [name, entry] of Object.entries(config)) {
		const loadedWorkspaces: IWorkspace[] = [];
		if (Array.isArray(entry)) {
			for (const item of entry) {
				loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(item, fluidRepo));
			}
		} else if (typeof entry === "object") {
			loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(entry, fluidRepo, name));
		} else {
			loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(entry, fluidRepo));
		}
		for (const ws of loadedWorkspaces) {
			workspaces.set(ws.name, ws);
		}
	}

	return workspaces;
}

/**
 * Loads workspaces based on an individual entry in the the "legacy" config -- the former repoPackages section of the
 * fluid-build config. A single entry may represent multiple workspaces, so this function returns all of them. An
 * example of such a case is when a legacy config includes a folder that isn't itself a package (i.e. it has no
 * package.json). Such config entries are intended to include all packages found under the path, so they are each
 * treated as individual single-package workspaces and are loaded as such.
 *
 * **ONLY INTENDED FOR BACK-COMPAT.**
 *
 * @param entry - The config entry.
 * @param fluidRepoRoot - The path to the root of the FluidRepo.
 * @param name - If provided, this name will be used for the workspace. If it is not provided, the name will be derived
 * from the directory name.
 */
function loadWorkspacesFromLegacyConfigEntry(
	// eslint-disable-next-line import/no-deprecated -- back-compat code
	entry: string | IFluidBuildDir,
	fluidRepo: IFluidRepo,
	name?: string,
): IWorkspace[] {
	const directory = typeof entry === "string" ? entry : entry.directory;
	const rgName = name ?? path.basename(directory);
	const workspaceName = rgName;
	const releaseGroupDefinitions: {
		[name: string]: ReleaseGroupDefinition;
	} = {};
	releaseGroupDefinitions[rgName] = {
		include: ["*"],
	};

	// BACK-COMPAT HACK - assume that a directory in the legacy config either has a package.json -- in which case the
	// directory will be treated as a workspace root -- or it does not, in which case all package.json files under the
	// path will be treated as workspace roots.
	const packagePath = path.join(fluidRepo.root, directory, "package.json");
	if (existsSync(packagePath)) {
		const workspaceDefinition: WorkspaceDefinition = {
			directory,
			releaseGroups: releaseGroupDefinitions,
		};

		return [Workspace.load(workspaceName, workspaceDefinition, fluidRepo.root, fluidRepo)];
	}

	const packageJsonPaths = globby
		.sync(["**/package.json"], {
			cwd: path.dirname(packagePath),
			gitignore: true,
			onlyFiles: true,
			absolute: true,
			// BACK-COMPAT HACK - only search two levels below entries for package.jsons. This avoids finding some test
			// files and treating them as packages. This is only needed when loading old configs.
			deep: 2,
		})
		.map(
			// Make the paths relative to the repo root
			(filePath) => path.relative(fluidRepo.root, filePath),
		);
	const workspaces = packageJsonPaths.flatMap((pkgPath) => {
		const dir = path.dirname(pkgPath);
		return loadWorkspacesFromLegacyConfigEntry(dir, fluidRepo);
	});
	return workspaces;
}
