/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseISO } from "date-fns";
import registerDebug from "debug";
import { exec, execNoError } from "./utils";

const traceGitRepo = registerDebug("fluid-build:gitRepo");

/**
 * @deprecated Should not be used outside the build-tools package.
 */
export class GitRepo {
	constructor(public readonly resolvedRoot: string) {}

	private async getRemotes() {
		const result = await this.exec(`remote -v`, `getting remotes`);
		const remoteLines = result.split(/\r?\n/);
		return remoteLines.map((line) => line.split(/\s+/));
	}

	/**
	 * Get the remote based on the partial Url.
	 * It will match the first remote that contains the partialUrl case insensitively
	 * @param partialUrl partial url to match case insensitively
	 */
	public async getRemote(partialUrl: string) {
		const lowerPartialUrl = partialUrl.toLowerCase();
		const remotes = await this.getRemotes();
		for (const r of remotes) {
			if (r[1] && r[1].toLowerCase().includes(lowerPartialUrl)) {
				return r[0];
			}
		}
		return undefined;
	}

	public async getCurrentSha() {
		const result = await this.exec(`rev-parse HEAD`, `get current sha`);
		return result.split(/\r?\n/)[0];
	}

	public async getShaForBranch(branch: string, remote?: string) {
		const refspec = remote ? `refs/remotes/${remote}/${branch}` : `refs/heads/${branch}`;
		const result = await this.execNoError(`show-ref ${refspec}`);
		if (result) {
			const line = result.split(/\r?\n/)[0];
			if (line) {
				return line.split(" ")[0];
			}
		}
		return undefined;
	}

	public async isBranchUpToDate(branch: string, remote: string) {
		await this.fetchBranch(remote, branch);
		const currentSha = await this.getShaForBranch(branch);
		const remoteSha = await this.getShaForBranch(branch, remote);
		return remoteSha === currentSha;
	}

	public async getStatus() {
		return await this.execNoError(`status --porcelain`);
	}

	public async getShaForTag(tag: string) {
		const result = await this.execNoError(`show-ref refs/tags/${tag}`);
		if (result) {
			const line = result.split(/\r?\n/)[0];
			if (line) {
				return line.split(" ")[0];
			}
		}
		return undefined;
	}

	/**
	 * Add a tag to the current commit
	 *
	 * @param tag the tag to add
	 */
	public async addTag(tag: string) {
		await this.exec(`tag ${tag}`, `adding tag ${tag}`);
	}

	/**
	 * Delete a tag
	 * NOTE: this doesn't fail on error
	 *
	 * @param tag the tag to add
	 */
	public async deleteTag(tag: string) {
		await this.execNoError(`tag -d ${tag}`);
	}

	/**
	 * Push a tag
	 *
	 */
	public async pushTag(tag: string, remote: string) {
		await this.exec(`push ${remote} ${tag}`, `pushing tag`);
	}

	/**
	 * Get the current git branch name
	 */
	public async getCurrentBranchName() {
		const revParseOut = await this.exec("rev-parse --abbrev-ref HEAD", "get current branch");
		return revParseOut.split(/\r?\n/)[0];
	}

	/**
	 * Create a new branch
	 *
	 * @param branchName name of the new branch
	 */
	public async createBranch(branchName: string) {
		await this.exec(`checkout -b ${branchName}`, `create branch ${branchName}`);
	}

	/**
	 * Push branch
	 * @param branchName
	 */
	public async pushBranch(remote: string, fromBranchName: string, toBranchName: string) {
		await this.exec(
			`push ${remote} ${fromBranchName}:${toBranchName}`,
			`push branch ${fromBranchName}->${toBranchName} to ${remote}`,
		);
	}

	/**
	 * Delete a branch
	 * NOTE: this doesn't fail on error
	 *
	 * @param branchName name of the new branch
	 */
	public async deleteBranch(branchName: string) {
		await this.execNoError(`branch -D ${branchName}`);
	}

	/**
	 * Switch branch
	 *
	 * @param branchName name of the new branch
	 */
	public async switchBranch(branchName: string) {
		await this.exec(`checkout ${branchName}`, `switch branch ${branchName}`);
	}

	/**
	 * Commit changes
	 *
	 * @param message the commit message
	 */
	public async commit(message: string, error: string) {
		await this.exec(`commit -a -F -`, error, message);
	}

	/**
	 * Fetch branch
	 */
	public async fetchBranch(remote: string, branchName: string) {
		return await this.exec(
			`fetch ${remote} ${branchName}`,
			`fetch branch ${branchName} from remote ${remote}`,
		);
	}

	/**
	 * Fetch Tags
	 */
	public async fetchTags() {
		return await this.exec(`fetch --tags --force`, `fetch tags`);
	}

	/**
	 * Get Tags
	 *
	 * @param pattern pattern of tags to get
	 */
	public async getTags(pattern: string) {
		return await this.exec(`tag -l ${pattern}`, `get tags ${pattern}`);
	}

	/**
	 * Get all tags matching a pattern.
	 *
	 * @param pattern - Pattern of tags to get.
	 */
	public async getAllTags(pattern?: string): Promise<string[]> {
		if (pattern === undefined || pattern.length === 0) {
			traceGitRepo(`Reading git tags from repo.`);
		} else {
			traceGitRepo(`Reading git tags from repo using pattern: '${pattern}'`);
		}
		const results =
			pattern === undefined || pattern.length === 0
				? await this.exec(`tag -l --sort=-committerdate`, `get all tags`)
				: await this.exec(`tag -l "${pattern}" --sort=-committerdate`, `get tags ${pattern}`);
		const tags = results.split("\n").filter((t) => t !== undefined && t !== "" && t !== null);

		traceGitRepo(`Found ${tags.length} tags.`);
		return tags;
	}

	/**
	 * Returns a set containing repo root-relative paths to files that are deleted in the working tree.
	 */
	public async getDeletedFiles(): Promise<Set<string>> {
		const results = await this.exec(`status --porcelain`, `get deleted files`);
		const allStatus = results.split("\n");
		// Deleted files are marked with D in the first (staged) or second (unstaged) column.
		// If a file is deleted in staged and then revived in unstaged, it will have two entries.
		// The first entry will be "D " and the second entry will be "??". Look for unstaged
		// files and remove them from deleted set.
		const deletedFiles = new Set(
			allStatus.filter((t) => t.match(/^.?D /)).map((t) => t.substring(3)),
		);
		const untrackedFiles = allStatus
			.filter((t) => t.startsWith("??"))
			.map((t) => t.substring(3));
		for (const untrackedFile of untrackedFiles) {
			deletedFiles.delete(untrackedFile);
		}
		return deletedFiles;
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
		/**
		 * What these git ls-files flags do:
		 *
		 * ```
		 * --cached: Includes cached (staged) files.
		 * --others: Includes other (untracked) files that are not ignored.
		 * --exclude-standard: Excludes files that are ignored by standard ignore rules.
		 * --full-name: Shows the full path of the files relative to the repository root.
		 * ```
		 *
		 * Note that `--deduplicate` is not used here because it is not available until git version 2.31.0.
		 */
		const command = `ls-files --cached --others --exclude-standard --full-name ${directory}`;
		const [fileResults, deletedFiles] = await Promise.all([
			this.exec(command, `get files`),
			this.getDeletedFiles(),
		]);

		// Deduplicate the list of files by building a Set.
		// This includes paths to deleted, unstaged files, so we get the list of deleted files from git status and remove
		// those from the full list.
		const allFiles = new Set(
			fileResults
				.split("\n")
				.map((line) => line.trim())
				// filter out empty lines
				.filter((line) => line !== ""),
		);

		for (const deletedFile of deletedFiles) {
			allFiles.delete(deletedFile);
		}

		// Files are already repo root-relative
		return [...allFiles];
	}

	/**
	 * @param gitRef - A reference to a git commit/tag/branch for which the commit date will be parsed.
	 * @returns The commit date of the ref.
	 */
	public async getCommitDate(gitRef: string) {
		const result = (
			await this.exec(`show -s --format=%cI "${gitRef}"`, `get commit date ${gitRef}`)
		).trim();
		const date = parseISO(result);
		return date;
	}

	public async setUpstream(branchName: string, remote: string = "origin") {
		return await this.exec(`push --set-upstream ${remote} ${branchName}`, `publish branch`);
	}

	public async addRemote(repoPath: string) {
		return await this.exec(`remote add upstream ${repoPath}`, `set remote`);
	}

	/**
	 * Execute git command
	 *
	 * @param command the git command
	 * @param error description of command line to print when error happens
	 */
	public async exec(command: string, error: string, pipeStdIn?: string) {
		return exec(`git ${command}`, this.resolvedRoot, error, pipeStdIn, {
			// Some git commands, like diff can have quite large output when there are very large changes like a pending merge with main.
			// To mitigate this, increase the maxBuffer size from its default (1 mb at time of writing).
			// https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
			maxBuffer: 1024 * 1024 * 100,
		});
	}

	/**
	 * Execute git command
	 *
	 * @param command the git command
	 */
	private async execNoError(command: string, pipeStdIn?: string) {
		return execNoError(`git ${command}`, this.resolvedRoot, pipeStdIn);
	}
}
