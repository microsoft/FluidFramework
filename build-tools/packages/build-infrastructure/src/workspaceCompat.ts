/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ignore from "ignore";
import { globSync } from "tinyglobby";

import type {
	// eslint-disable-next-line import-x/no-deprecated -- back-compat code
	IFluidBuildDir,
	// eslint-disable-next-line import-x/no-deprecated -- back-compat code
	IFluidBuildDirs,
	ReleaseGroupDefinition,
	WorkspaceDefinition,
} from "./config.js";
import type { IBuildProject, IWorkspace, WorkspaceName } from "./types.js";
import { Workspace } from "./workspace.js";

/**
 * Loads workspaces based on the "legacy" config -- the former repoPackages section of the fluid-build config.
 *
 * **ONLY INTENDED FOR BACK-COMPAT.**
 *
 * @param entry - The config entry.
 * @param buildProject - The BuildProject the workspace belongs to.
 */
export function loadWorkspacesFromLegacyConfig(
	// eslint-disable-next-line import-x/no-deprecated -- back-compat code
	config: IFluidBuildDirs,
	buildProject: IBuildProject,
): Map<WorkspaceName, IWorkspace> {
	const workspaces: Map<WorkspaceName, IWorkspace> = new Map();

	// Iterate over the entries and create synthetic workspace definitions for them, then load the workspaces.
	for (const [name, entry] of Object.entries(config)) {
		const loadedWorkspaces: IWorkspace[] = [];
		if (Array.isArray(entry)) {
			for (const item of entry) {
				loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(item, buildProject));
			}
		} else if (typeof entry === "object") {
			loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(entry, buildProject, name));
		} else {
			loadedWorkspaces.push(...loadWorkspacesFromLegacyConfigEntry(entry, buildProject));
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
 * @param buildProject - The path to the root of the BuildProject.
 * @param name - If provided, this name will be used for the workspace. If it is not provided, the name will be derived
 * from the directory name.
 */
function loadWorkspacesFromLegacyConfigEntry(
	// eslint-disable-next-line import-x/no-deprecated -- back-compat code
	entry: string | IFluidBuildDir,
	buildProject: IBuildProject,
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
	const packagePath = path.join(buildProject.root, directory, "package.json");
	if (existsSync(packagePath)) {
		const workspaceDefinition: WorkspaceDefinition = {
			directory,
			releaseGroups: releaseGroupDefinitions,
		};

		return [
			Workspace.load(workspaceName, workspaceDefinition, buildProject.root, buildProject),
		];
	}

	const cwd = path.dirname(packagePath);
	const allFiles = globSync(["**/package.json"], {
		cwd,
		onlyFiles: true,
		absolute: true,
		// BACK-COMPAT HACK - only search two levels below entries for package.jsons. This avoids finding some test
		// files and treating them as packages. This is only needed when loading old configs.
		deep: 2,
	});

	// Apply gitignore filtering
	const packageJsonPaths = filterByGitignoreSync(allFiles, cwd).map(
		// Make the paths relative to the buildProject root
		(filePath) => path.relative(buildProject.root, filePath),
	);
	const workspaces = packageJsonPaths.flatMap((pkgPath) => {
		const dir = path.dirname(pkgPath);
		return loadWorkspacesFromLegacyConfigEntry(dir, buildProject);
	});
	return workspaces;
}

/**
 * Converts a path to use forward slashes (POSIX style).
 */
function toPosixPath(s: string): string {
	return s.replace(/\\/g, "/");
}

/**
 * Filters an array of absolute file paths using gitignore rules synchronously.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 */
function filterByGitignoreSync(files: string[], cwd: string): string[] {
	// Read .gitignore rule sets for the cwd and its parent directories
	const ruleSets = readGitignoreRuleSetsSync(cwd);
	if (ruleSets.length === 0) {
		return files;
	}

	return files.filter((file) => {
		const relativeToCwd = path.relative(cwd, file);
		// Only filter files that are within the cwd
		if (relativeToCwd.startsWith("..") || path.isAbsolute(relativeToCwd)) {
			return true;
		}

		const absoluteFilePath = path.resolve(file);
		let isIgnored = false;

		for (const { dir, ig } of ruleSets) {
			const relativeToRuleDir = path.relative(dir, absoluteFilePath);
			// Skip rule sets whose directory does not contain this file
			if (relativeToRuleDir.startsWith("..") || path.isAbsolute(relativeToRuleDir)) {
				continue;
			}

			const testResult = ig.test(toPosixPath(relativeToRuleDir));
			if (testResult.ignored) {
				isIgnored = true;
			} else if (testResult.unignored) {
				isIgnored = false;
			}
		}

		return !isIgnored;
	});
}

/**
 * A gitignore rule set binds a directory to an `ignore` instance configured
 * with the patterns from that directory's .gitignore file.
 */
type GitignoreRuleSet = {
	dir: string;
	ig: ReturnType<typeof ignore>;
};

/**
 * Cache for gitignore rule sets per directory path.
 *
 * This avoids re-reading .gitignore files for the same directory within a single process run.
 * Note: The cache is not automatically refreshed if `.gitignore` files are modified at runtime.
 * To pick up changes, the process must be restarted.
 */
const gitignoreRuleSetsCache = new Map<string, GitignoreRuleSet[]>();

/**
 * Reads gitignore patterns from .gitignore files in the given directory and its
 * parents synchronously, returning a list of rule sets ordered from ancestor to descendant.
 * Results are cached per directory path to avoid repeated filesystem reads.
 *
 * Because of this caching, changes to `.gitignore` files made after the first read
 * for a given directory will not be reflected until the process is restarted.
 */
function readGitignoreRuleSetsSync(dir: string): GitignoreRuleSet[] {
	// Check cache first
	const cached = gitignoreRuleSetsCache.get(dir);
	if (cached !== undefined) {
		return cached;
	}

	const ruleSets: GitignoreRuleSet[] = [];
	const dirs: string[] = [];

	// Collect directory chain from dir up to filesystem root
	let currentDir = dir;
	while (true) {
		dirs.push(currentDir);
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	// Walk from the highest ancestor down to the provided dir
	for (const directory of dirs.reverse()) {
		const gitignorePath = path.join(directory, ".gitignore");
		if (!existsSync(gitignorePath)) {
			continue;
		}

		try {
			const content = readFileSync(gitignorePath, "utf8");
			// Parse gitignore content - each non-empty, non-comment line is a pattern
			const filePatterns = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));

			if (filePatterns.length > 0) {
				const ig = ignore();
				ig.add(filePatterns);
				ruleSets.push({ dir: directory, ig });
			}
		} catch {
			// Ignore errors reading .gitignore files
		}
	}

	// Cache the result
	gitignoreRuleSetsCache.set(dir, ruleSets);
	return ruleSets;
}
