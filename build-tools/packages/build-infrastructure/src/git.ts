/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import execa from "execa";
import readPkgUp from "read-pkg-up";
import type { SimpleGit } from "simple-git";

import { NotInGitRepository } from "./errors.js";
import type { IFluidRepo, IPackage, IReleaseGroup, IWorkspace, PackageName } from "./types.js";

/**
 * Get the merge base between the current HEAD and the remote branch.
 *
 * @param branch - The branch to compare against.
 * @param remote - The remote to compare against.
 * @param localRef - The local ref to compare against. Defaults to HEAD.
 * @returns The ref of the merge base between the current HEAD and the remote branch.
 */
export async function getMergeBaseRemote(
	git: SimpleGit,
	branch: string,
	remote: string,
	localRef = "HEAD",
): Promise<string> {
	const base = await git
		.fetch([remote]) // make sure we have the latest remote refs
		.raw("merge-base", `refs/remotes/${remote}/${branch}`, localRef);
	return base;
}

/**
 * Gets all the files that have changed when compared to a remote ref.
 */
async function getChangedFilesSinceRef(
	git: SimpleGit,
	ref: string,
	remote: string,
): Promise<string[]> {
	// Find the merge base commit
	const divergedAt = await getMergeBaseRemote(git, ref, remote);
	// Now we can find which files we added
	const added = await git
		.fetch(["--all"]) // make sure we have the latest remote refs
		.diff(["--name-only", "--diff-filter=d", divergedAt]);

	const files = added
		.split("\n")
		.filter((value) => value !== null && value !== undefined && value !== "");
	return files;
}

/**
 * Gets all the directory paths that have changes when compared to a remote ref.
 */
async function getChangedDirectoriesSinceRef(
	git: SimpleGit,
	ref: string,
	remote: string,
): Promise<string[]> {
	const files = await getChangedFilesSinceRef(git, ref, remote);
	const dirs = new Set(files.map((f) => path.dirname(f)));
	return [...dirs];
}

/**
 * Gets the changed files, directories, release groups, and packages since the given ref.
 *
 * @param fluidRepo - The Fluid repo.
 * @param ref - The ref to compare against.
 * @param remote - The remote to compare against.
 * @returns An object containing the changed files, directories, release groups, workspaces, and packages. Note that a
 * package may appear in multiple groups. That is, if a single package in a release group is changed, the releaseGroups
 * value will contain that group, and the packages value will contain only the single package. Also, if two packages are
 * changed, each within separate release groups, the packages value will contain both packages, and the releaseGroups
 * value will contain both release groups.
 */
export async function getChangedSinceRef<P extends IPackage>(
	fluidRepo: IFluidRepo<P>,
	ref: string,
	remote: string,
): Promise<{
	files: string[];
	dirs: string[];
	workspaces: IWorkspace[];
	releaseGroups: IReleaseGroup[];
	packages: IPackage[];
}> {
	const git = await fluidRepo.getGitRepository();
	const repoRoot = await git.revparse(["--show-toplevel"]);
	const files = await getChangedFilesSinceRef(git, ref, remote);
	const dirs = await getChangedDirectoriesSinceRef(git, ref, remote);

	const changedPackageNames = dirs
		.map((dir) => {
			const cwd = path.resolve(repoRoot, dir);
			return readPkgUp.sync({ cwd })?.packageJson.name;
		})
		.filter((name): name is string => name !== undefined);

	const changedPackages = [...new Set(changedPackageNames)]
		.map((name) => fluidRepo.packages.get(name as PackageName))
		.filter((pkg): pkg is P => pkg !== undefined);

	const changedReleaseGroups = [...new Set(changedPackages.map((pkg) => pkg.releaseGroup))]
		.map((rg) => fluidRepo.releaseGroups.get(rg))
		.filter((rg): rg is IReleaseGroup => rg !== undefined);

	const changedWorkspaces = [...new Set(changedReleaseGroups.map((ws) => ws.workspace))];

	return {
		files,
		dirs,
		workspaces: changedWorkspaces,
		releaseGroups: changedReleaseGroups,
		packages: changedPackages,
	};
}

/**
 * Get a matching git remote name based on a partial URL to the remote repo. It will match the first remote that
 * contains the partialUrl case insensitively.
 *
 * @param partialUrl - partial URL to match case insensitively
 */
export async function getRemote(
	git: SimpleGit,
	partialUrl: string | undefined,
): Promise<string | undefined> {
	if (partialUrl === undefined) {
		return undefined;
	}

	const lowerPartialUrl = partialUrl.toLowerCase();
	const remotes = await git.getRemotes(/* verbose */ true);

	for (const r of remotes) {
		if (r.refs.fetch.toLowerCase().includes(lowerPartialUrl)) {
			return r.name;
		}
	}
}

/**
 * Returns an array containing repo repo-relative paths to all the files in the provided directory.
 * A given path will only be included once in the array; that is, there will be no duplicate paths.
 * Note that this function excludes files that are deleted locally whether the deletion is staged or not.
 *
 * @param directory - A directory to filter the results by. Only files under this directory will be returned. To
 * return all files in the repo use the value `"."`.
 */
export async function getFiles(git: SimpleGit, directory: string): Promise<string[]> {
	// Note that `--deduplicate` is not used here because it is not available until git version 2.31.0.
	const results = await git.raw(
		"ls-files",
		// Includes cached (staged) files.
		"--cached",
		// Includes other (untracked) files that are not ignored.
		"--others",
		// Excludes files that are ignored by standard ignore rules.
		"--exclude-standard",
		// Shows the full path of the files relative to the repository root.
		"--full-name",
		directory,
	);

	// Deduplicate the list of files by building a Set.
	// This includes paths to deleted, unstaged files, so we get the list of deleted files from git status and remove
	// those from the full list.
	const allFiles = new Set(
		results
			.split("\n")
			.map((line) => line.trim())
			// filter out empty lines
			.filter((line) => line !== ""),
	);
	const status = await git.status();
	for (const deletedFile of status.deleted) {
		allFiles.delete(deletedFile);
	}

	// Files are already repo root-relative
	return [...allFiles];
}

/**
 * Returns the absolute path to the nearest Git repository root found starting at `cwd`.
 *
 * @param cwd - The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
 * provided.
 *
 * @throws A `NotInGitRepository` error if no git repo is found.
 *
 * @privateRemarks
 * This function is helpful because it is synchronous. The SimpleGit wrapper is async-only.
 */
export function findGitRootSync(cwd = process.cwd()): string {
	try {
		// This call will throw outside a git repo, which we'll catch and throw a NotInGitRepo error instead.
		const result = execa.sync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			// Ignore stdin but pipe (capture) stdout and stderr since git will write to both.
			stdio: ["ignore", "pipe", "pipe"],
		});

		// If anything was written to stderr, then it's not a git repo.
		// This is likely unnecessary since the earlier exec call should throw, but just in case, throw here as well.
		if (result.stderr) {
			throw new NotInGitRepository(cwd);
		}

		return result.stdout.trim();
	} catch (error) {
		const message = (error as Error).message;
		if (message.includes("not a git repository")) {
			throw new NotInGitRepository(cwd);
		}
		throw error;
	}
}
