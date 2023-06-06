/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Context, Package } from "@fluidframework/build-tools";
import path from "node:path";
import readPkgUp from "read-pkg-up";
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";

// type-fest seems to trigger this lint rule, which seems to be a false positive.
// eslint-disable-next-line node/no-missing-import
import type { SetRequired } from "type-fest";

import { CommandLogger } from "../logging";
import { ReleaseGroup } from "../releaseGroups";

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
export class Repository {
	private readonly git: SimpleGit;

	/**
	 * A git client for the repository that can be used to call git directly.
	 *
	 * @internal
	 */
	public get gitClient(): SimpleGit {
		return this.git;
	}

	constructor(
		gitOptions: SetRequired<Partial<SimpleGitOptions>, "baseDir">,
		protected readonly log?: CommandLogger,
	) {
		const options: SetRequired<Partial<SimpleGitOptions>, "baseDir"> = {
			...gitOptions,
			...defaultGitOptions,
		};
		log?.verbose("gitOptions:");
		log?.verbose(JSON.stringify(options));
		this.git = simpleGit(options);
	}

	/**
	 * Returns the SHA hash for a branch. If a remote is provided, the SHA for the remote ref is returned.
	 */
	public async getShaForBranch(branch: string, remote?: string): Promise<string> {
		const refspec =
			remote === undefined ? `refs/heads/${branch}` : `refs/remotes/${remote}/${branch}`;
		const result = await this.git.raw(`show-ref`, refspec);

		return result;
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
	 * @param branch - The branch to compare against.
	 * @param remote - The remote to compare against.
	 * @param localRef - The local ref to compare against. Defaults to HEAD.
	 * @returns The ref of the merge base between the current HEAD and the remote branch.
	 */
	public async getMergeBase(branch: string, remote: string, localRef = "HEAD"): Promise<string> {
		const base = await this.gitClient
			.fetch(["--all"]) // make sure we have the latest remote refs
			.raw("merge-base", `refs/remotes/${remote}/${branch}`, localRef);
		return base;
	}

	private async getChangedFilesSinceRef(ref: string, remote: string): Promise<string[]> {
		const divergedAt = await this.getMergeBase(ref, remote);
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
}
