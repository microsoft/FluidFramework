/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { Package } from "@fluidframework/build-tools";
import { PackageName } from "@rushstack/node-core-library";
import readPkgUp from "read-pkg-up";
import * as semver from "semver";
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";
import type { SetRequired } from "type-fest";

import type { IReleaseGroup } from "@fluid-tools/build-infrastructure";
import { getVersionsFromStrings } from "@fluid-tools/version-tools";
import { parseISO } from "date-fns";
import { CommandLogger } from "../logging.js";
import { ReleaseGroup } from "../releaseGroups.js";
// eslint-disable-next-line import/no-deprecated
import { Context, type VersionDetails, isMonoRepoKind } from "./context.js";

const newlineCrossPlatform = /\r?\n/;
/**
 * Parses the version from a git tag.
 *
 * @param tag - The tag.
 * @returns The version string, or undefined if one could not be found.
 *
 * TODO: Need to reconcile slightly different version in version-tools/src/schemes.ts
 */
function getVersionFromTag(tag: string): string | undefined {
	// This is sufficient, but there is a possibility that this will fail if we add a tag that includes "_v" in its
	// name.
	const tagSplit = tag.split("_v");
	if (tagSplit.length !== 2) {
		return undefined;
	}

	const ver = semver.parse(tagSplit[1]);
	if (ver === null) {
		return undefined;
	}

	return ver.version;
}

/**
 * Get all version tags for a given prefix.
 *
 * @param git - The git repository.
 * @param prefix - Prefix to search for.
 * @returns List of version tags.
 */
async function getVersionTags(git: SimpleGit, prefix: string): Promise<string[]> {
	const raw_tags = git.tags(["--list", `${prefix}_v*`]);
	const tags = await raw_tags;
	return tags.all;
}

/**
 * Get all the versions for a release group. This function only considers the tags in the repo.
 *
 * @param git - The git repository.
 * @param releaseGroup - The release group to get versions for.
 * @returns List of version details, or undefined if one could not be found.
 */
export async function getVersionsFromTags(
	git: Readonly<SimpleGit>,
	releaseGroup: IReleaseGroup,
	tags?: string[],
): Promise<string[] | undefined> {
	// use the tags passed in for testing, otherwise get the tags from the repo
	const versionTags = tags ?? (await getVersionTags(git, releaseGroup.name));

	if (versionTags.length === 0) {
		return undefined;
	}

	const versions = getVersionsFromStrings(releaseGroup.name, versionTags);

	return versions;
}

/**
 * A type of string used to denote a GitHub repo by owner and repo name.
 */
export type GitHubRepoShortString = `${string}/${string}`;

/**
 * Context object with metadata about the local Git repository. This is used by CLI commands that need access to
 * relevant metadata that can't be queried from Git itself, such as the `upstreamRemotePartialUrl`.
 */
export interface GitContext {
	/**
	 * A string of the form "OWNER/REPO" that is a substring of the full URL to an upstream remote repository on GitHub.
	 * If a remote is found that partially matches this string, it will be considered the upstream remote.
	 */
	upstreamRemotePartialUrl: Readonly<GitHubRepoShortString>;

	/**
	 * The branch name when the Git context was initialized.
	 */
	originalBranchName: Readonly<string>;

	/**
	 * New branches created since this context was initialized.
	 */
	newBranches: string[];
}

/**
 * Default options passed to the git client.
 */
const defaultGitOptions: Partial<SimpleGitOptions> = {
	binary: "git",
	maxConcurrentProcesses: 6,
	trimmed: true,
};

/**
 * A small wrapper around a git repo to provide API access to it.
 *
 * @remarks
 *
 * Eventually this should replace the legacy GitRepo class in build-tools. That class exec's git commands directly,
 * while this class uses a library wrapper around git where possible instead. Note that git is still called "directly" via the `raw` API.
 *
 * @internal
 */
export class Repository implements GitContext {
	private readonly git: SimpleGit;

	/**
	 * A git client for the repository that can be used to call git directly.
	 */
	public get gitClient(): SimpleGit {
		return this.git;
	}

	public readonly originalBranchName: string;
	public readonly newBranches: string[] = [];

	constructor(
		gitOptions: SetRequired<Partial<SimpleGitOptions>, "baseDir">,
		public readonly upstreamRemotePartialUrl: GitHubRepoShortString,
		protected readonly log?: CommandLogger,
	) {
		const options: SetRequired<Partial<SimpleGitOptions>, "baseDir"> = {
			...gitOptions,
			...defaultGitOptions,
		};
		log?.verbose("gitOptions:");
		log?.verbose(JSON.stringify(options));
		this.git = simpleGit(options);

		// Use synchronous git functions since we're in a constructor
		const currentBranch = getCurrentBranchNameSync(gitOptions.baseDir);
		this.originalBranchName = currentBranch;
	}

	/**
	 * Returns the SHA hash for a branch. If a remote is provided, the SHA for the remote ref is returned.
	 */
	public async getShaForBranch(branch: string, remote?: string): Promise<string> {
		const refspec =
			remote === undefined ? `refs/heads/${branch}` : `refs/remotes/${remote}/${branch}`;
		// result is a string of the form '64adcdba56deb16e0641c91ca825401a9f7a01f9 refs/heads/release/client/2.23'
		const result = await this.git.raw(`show-ref`, refspec);

		const [sha] = result.split(" ");
		return sha;
	}

	/**
	 * Get the remote based on the partial Url. It will match the first remote that contains the partialUrl case
	 * insensitively.
	 *
	 * @param partialUrl - partial url to match case insensitively
	 */
	public async getRemote(partialUrl: string): Promise<string | undefined> {
		const lowerPartialUrl = partialUrl.toLowerCase();
		const remotes = await this.git.getRemotes(/* verbose */ true);

		for (const r of remotes) {
			if (r.refs.fetch.toLowerCase().includes(lowerPartialUrl)) {
				return r.name;
			}
		}
	}

	/**
	 * Get the merge base between the current HEAD and the remote branch.
	 *
	 * @param branch - The branch to compare against.
	 * @param remote - The remote to compare against.
	 * @param localRef - The local ref to compare against. Defaults to HEAD.
	 * @returns The ref of the merge base between the current HEAD and the remote branch.
	 */
	public async getMergeBaseRemote(
		branch: string,
		remote: string,
		localRef = "HEAD",
	): Promise<string> {
		const base = await this.gitClient
			.fetch([remote]) // make sure we have the latest remote refs
			.raw("merge-base", `refs/remotes/${remote}/${branch}`, localRef);
		return base;
	}

	/**
	 * Get the merge base between two refs.
	 *
	 * @param ref1 - The first ref to compare.
	 * @param ref2 - The ref to compare against.
	 * @returns The ref of the merge base between the two refs.
	 */
	public async getMergeBase(ref1: string, ref2: string): Promise<string> {
		const base = await this.gitClient.raw("merge-base", `${ref1}`, ref2);
		return base;
	}

	private async getChangedFilesSinceRef(ref: string, remote: string): Promise<string[]> {
		const divergedAt = await this.getMergeBaseRemote(ref, remote);
		// Now we can find which files we added
		const added = await this.gitClient
			.fetch(["--all"]) // make sure we have the latest remote refs
			.diff(["--name-only", "--diff-filter=d", divergedAt]);

		const files = added
			.split("\n")
			.filter((value) => value !== null && value !== undefined && value !== "");
		return files;
	}

	private async getChangedDirectoriesSinceRef(ref: string, remote: string): Promise<string[]> {
		const files = await this.getChangedFilesSinceRef(ref, remote);
		const dirs = new Set(files.map((f) => path.dirname(f)));
		return [...dirs];
	}

	/**
	 * Gets the changed files, directories, release groups, and packages since the given ref.
	 *
	 * @param ref - The ref to compare against.
	 * @param remote - The remote to compare against.
	 * @param context - The Context.
	 * @returns An object containing the changed files, directories, release groups, and packages. The groups may overlap.
	 * That is, if a single package in a release group is changed, the releaseGroups value will contain that group, and
	 * the packages value will contain only the single package. Also, if two packages are changed, one within a release
	 * group and one independent, the packages value will contain both packages.
	 */
	public async getChangedSinceRef(
		ref: string,
		remote: string,
		context: Context,
	): Promise<{
		files: string[];
		dirs: string[];
		releaseGroups: ReleaseGroup[];
		packages: Package[];
	}> {
		const files = await this.getChangedFilesSinceRef(ref, remote);
		const dirs = await this.getChangedDirectoriesSinceRef(ref, remote);

		const changedPackageNames = dirs
			.map((dir) => {
				const cwd = path.resolve(context.repo.resolvedRoot, dir);
				return readPkgUp.sync({ cwd })?.packageJson.name;
			})
			.filter((name): name is string => name !== undefined);

		const changedPackages = [...new Set(changedPackageNames)]
			.map((name) => context.fullPackageMap.get(name))
			.filter((pkg): pkg is Package => pkg !== undefined);

		const changedReleaseGroups = [
			...new Set(changedPackages.map((pkg) => pkg.monoRepo?.kind)),
		].filter((rg): rg is ReleaseGroup => rg !== undefined);

		return {
			files,
			dirs,
			releaseGroups: changedReleaseGroups,
			packages: changedPackages,
		};
	}

	/**
	 * Calls `git rev-list` to get all commits between the base and head commits.
	 *
	 * @param baseCommit - The base commit.
	 * @param headCommit - The head commit. Defaults to HEAD.
	 * @returns An array of all commits between the base and head commits.
	 */
	public async revList(baseCommit: string, headCommit: string = "HEAD"): Promise<string[]> {
		const result = await this.git.raw("rev-list", `${baseCommit}..${headCommit}`, "--reverse");
		return result
			.split(newlineCrossPlatform)
			.filter((value) => value !== null && value !== undefined && value !== "");
	}

	public async canMergeWithoutConflicts(commit: string): Promise<boolean> {
		let mergeResult;
		try {
			console.log(`Checking merge conflicts for: ${commit}`);
			mergeResult = await this.git.merge([commit, "--no-commit", "--no-ff"]);
			await this.git.merge(["--abort"]);
		} catch {
			console.log(`Merge conflicts exists for: ${commit}`);
			await this.git.merge(["--abort"]);
			return false;
		}

		return mergeResult.result === "success";
	}

	/**
	 * Returns an array containing repo repo-relative paths to all the files in the provided directory.
	 * A given path will only be included once in the array; that is, there will be no duplicate paths.
	 * Note that this function excludes files that are deleted locally whether the deletion is staged or not.
	 *
	 * @param directory - A directory to filter the results by. Only files under this directory will be returned. To
	 * return all files in the repo use the value `"."`.
	 */
	public async getFiles(directory: string): Promise<string[]> {
		// Note that `--deduplicate` is not used here because it is not available until git version 2.31.0.
		const results = await this.gitClient.raw(
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
		const status = await this.gitClient.status();
		for (const deletedFile of status.deleted) {
			allFiles.delete(deletedFile);
		}

		// Files are already repo root-relative
		return [...allFiles];
	}

	/**
	 * Map of release group/package name to all the git tags for the group/package.
	 */
	private readonly _tags: Map<string, string[]> = new Map();

	/**
	 * Returns an array of all the git tags associated with a release group.
	 *
	 * @param releaseGroupOrPackage - The release group or independent package to get tags for.
	 * @returns An array of all all the tags for the release group or package.
	 */
	public async getTagsForReleaseGroup(releaseGroupOrPackage: string): Promise<string[]> {
		// eslint-disable-next-line import/no-deprecated
		const prefix = isMonoRepoKind(releaseGroupOrPackage)
			? releaseGroupOrPackage.toLowerCase()
			: PackageName.getUnscopedName(releaseGroupOrPackage);
		const cacheEntry = this._tags.get(prefix);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}

		const tags = await this.gitClient.tags(["--list", `${prefix}_v*`]);
		this._tags.set(prefix, tags.all);
		return tags.all;
	}

	private readonly _versions: Map<string, VersionDetails[]> = new Map();

	/**
	 * Gets all the versions for a release group or independent package. This function only considers the tags in the
	 * repo to determine releases and dates.
	 *
	 * @param releaseGroupOrPackage - The release group or independent package to get versions for.
	 * @returns An array of {@link VersionDetails} containing the version and date for each version.
	 */
	public async getAllVersions(
		releaseGroupOrPackage: string,
	): Promise<VersionDetails[] | undefined> {
		const cacheEntry = this._versions.get(releaseGroupOrPackage);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}

		const versions = new Map<string, Date>();
		const tags = await this.getTagsForReleaseGroup(releaseGroupOrPackage);

		for (const tag of tags) {
			const ver = getVersionFromTag(tag);
			if (ver !== undefined && ver !== "" && ver !== null) {
				// eslint-disable-next-line no-await-in-loop
				const rawDate = await this.gitClient.show([
					// Suppress the diff output
					"-s",
					// ISO 8601 format
					"--format=%cI",
					// the git ref - a tag in this case
					tag,
				]);
				const date = parseISO(rawDate.trim());
				versions.set(ver, date);
			}
		}

		if (versions.size === 0) {
			return undefined;
		}

		const toReturn: VersionDetails[] = [];
		for (const [version, date] of versions) {
			toReturn.push({ version, date });
		}

		this._versions.set(releaseGroupOrPackage, toReturn);
		return toReturn;
	}

	/**
	 * Create a branch with the specified name. Throw an error if the branch already exists.
	 */
	public async createBranch(branchName: string): Promise<void> {
		if (await this.getShaForBranch(branchName)) {
			throw new Error(`Branch '${branchName}' already exists. Failed to create.`);
		}
		await this.gitClient.checkoutLocalBranch(branchName);
	}

	public async getCurrentSha(): Promise<string> {
		const result = await this.gitClient.revparse(["HEAD"]);
		return result;
	}

	/**
	 * Get the current git branch name
	 */
	public async getCurrentBranchName(): Promise<string> {
		const result = await this.gitClient.revparse(["--abbrev-ref", "HEAD"]);
		return result;
	}

	public async isBranchUpToDate(branch: string, remote: string): Promise<boolean> {
		await this.fetchBranch(remote, branch);
		const currentSha = await this.getShaForBranch(branch);
		const remoteSha = await this.getShaForBranch(branch, remote);
		return remoteSha === currentSha;
			}

	/**
	 * Fetch branch
	 */
	public async fetchBranch(remote: string, branchName: string): Promise<void> {
		await this.gitClient.fetch(remote, branchName);
	}
}

/**
 * Finds the current branch of a Git repository synchronously.
 *
 * This function uses `git rev-parse --abbrev-ref HEAD` command to find the current branch name. It executes the command
 * synchronously using `child_process.execFileSync`. If the current directory is not part of a Git repository, it throws
 * an error.
 *
 * @param cwd - The directory from which we should try to get the current Git branch.
 * @returns The name of the current branch.
 * @throws Error If `cwd` is not part of a Git repository.
 */
export function getCurrentBranchNameSync(cwd: string = process.cwd()): string {
	try {
		const revParseOut = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd,
			encoding: "utf8",
		}).trim();
		return revParseOut.split(/\r?\n/)[0];
	} catch (error) {
		throw new Error(
			`Failed to find Git branch name. Make sure you are inside a Git repository. Error: ${error}`,
		);
	}
}
