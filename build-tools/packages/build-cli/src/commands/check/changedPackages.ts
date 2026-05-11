/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { dirname } from "node:path/posix";

import { getChangedSinceRef, getRemote } from "@fluid-tools/build-infrastructure";
import { Flags } from "@oclif/core";
import type { SimpleGit } from "simple-git";

import { BaseCommandWithBuildProject } from "../../library/commands/base.js";

/**
 * Full-run trigger patterns. A diff touching any of these paths forces running
 * every package's tests. Keep this conservative since these files can affect
 * dependency resolution, build behavior, or pipeline behavior across packages.
 */
export const fullRunPatterns: readonly RegExp[] = [
	/^package\.json$/,
	/^pnpm-lock\.yaml$/,
	/^pnpm-workspace\.yaml$/,
	/^\.pnpmfile\.cjs$/,
	/^\.npmrc$/,
	/^\.nvmrc$/,
	/^fluidBuild\.config\.cjs$/,
	/^tsconfig[^/]*\.json$/,
	/^biome\./,
	/^tools\//,
	/^common\//,
	/^scripts\//,
	/^\.changeset\/config\.json$/,
];

export interface ChangedPackagesResult {
	shouldRunTests: boolean;
	scopedPnpmFilter: string;
	targetBranch: string;
	mergeBase?: string;
	changedFiles: string[];
	forcedFullRunPattern?: string;
	changedPackageCount: number;
}

export function normalizeTargetBranch(branch: string): string {
	const prefix = "refs/heads/";
	return branch.startsWith(prefix) ? branch.slice(prefix.length) : branch;
}

export function checkFullRunPatterns(
	files: readonly string[],
	patterns: readonly RegExp[] = fullRunPatterns,
): RegExp | undefined {
	for (const pattern of patterns) {
		if (files.some((file) => pattern.test(file))) {
			return pattern;
		}
	}
	return undefined;
}

export function buildPackageDirSet(
	mergeBase: string,
	listHistoricalPackages: (ref: string) => readonly string[],
	listCurrentPackages: () => readonly string[],
): Set<string> {
	const dirs = new Set<string>();
	for (const file of listHistoricalPackages(mergeBase)) {
		dirs.add(dirname(file));
	}
	for (const file of listCurrentPackages()) {
		dirs.add(dirname(file));
	}
	return dirs;
}

export function anyChangedFileInPackages(
	changedFiles: readonly string[],
	packageDirs: ReadonlySet<string>,
): boolean {
	for (const file of changedFiles) {
		if (file === "") {
			continue;
		}

		let dir = dirname(file);
		while (dir !== "." && dir !== "/") {
			if (packageDirs.has(dir)) {
				return true;
			}
			dir = dirname(dir);
		}
	}
	return false;
}

const packageJsonPattern = /(^|\/)package\.json$/;

function packageJsonFilesFromGitOutput(output: string): string[] {
	return output.split("\n").filter((file) => packageJsonPattern.test(file));
}

async function resolveMergeBase(
	git: Readonly<SimpleGit>,
	remote: string,
	targetBranch: string,
	log: (message: string) => void,
): Promise<string> {
	try {
		return (
			await git.raw("merge-base", "HEAD", `refs/remotes/${remote}/${targetBranch}`)
		).trim();
	} catch {
		const isShallow = (await git.raw("rev-parse", "--is-shallow-repository")).trim();
		if (isShallow !== "true") {
			throw new Error(`No merge-base with ${remote}/${targetBranch}`);
		}

		log("Merge-base not found in shallow clone; deepening and retrying.");
		await git.fetch(["--deepen", "1000", remote, targetBranch]);
		return (
			await git.raw("merge-base", "HEAD", `refs/remotes/${remote}/${targetBranch}`)
		).trim();
	}
}

export default class CheckChangedPackagesCommand extends BaseCommandWithBuildProject<
	typeof CheckChangedPackagesCommand
> {
	static readonly summary =
		"Computes Azure DevOps output variables for changed-package-scoped test runs.";

	static readonly description =
		"Compares the current PR branch to the merge base with a target branch, then emits shouldRunTests and scopedPnpmFilter output variables. Unexpected errors conservatively fall back to a full test run.";

	static readonly enableJsonFlag = true;

	static readonly flags = {
		targetBranch: Flags.string({
			description:
				"Target branch to compare against. Defaults to the TARGET_BRANCH environment variable.",
		}),
		searchPath: Flags.directory({
			description:
				"Path used to locate the build project. Defaults to the current working directory.",
			exists: true,
		}),
		...BaseCommandWithBuildProject.flags,
	} as const;

	public async run(): Promise<ChangedPackagesResult> {
		const targetBranch = normalizeTargetBranch(
			this.flags.targetBranch ?? process.env.TARGET_BRANCH ?? "",
		);

		if (targetBranch === "") {
			return this.fallbackFullRun("TARGET_BRANCH not set;", targetBranch);
		}

		this.info(`Target branch: ${targetBranch}`);

		try {
			const buildProject = this.getBuildProject(
				path.resolve(this.flags.searchPath ?? process.cwd()),
			);
			const git = await buildProject.getGitRepository();
			const remote = await getRemote(git, buildProject.upstreamRemotePartialUrl);
			if (remote === undefined) {
				return this.fallbackFullRun(
					`Could not find upstream remote for ${buildProject.upstreamRemotePartialUrl};`,
					targetBranch,
				);
			}

			await git.fetch([remote, targetBranch]);
			const mergeBase = await resolveMergeBase(git, remote, targetBranch, (message) =>
				this.info(message),
			);
			this.info(`Merge base: ${mergeBase}`);

			const changed = await getChangedSinceRef(buildProject, targetBranch, remote);
			const changedFiles = changed.files;
			this.info(`Changed files (${changedFiles.length}):`);
			for (const file of changedFiles.slice(0, 30)) {
				this.info(file);
			}
			if (changedFiles.length > 30) {
				this.info(`... and ${changedFiles.length - 30} more`);
			}

			const match = checkFullRunPatterns(changedFiles);
			if (match !== undefined) {
				this.info(`Match for full-run pattern '${match.source}' - forcing full test run.`);
				this.emitVsoOutputs(true, "");
				return {
					shouldRunTests: true,
					scopedPnpmFilter: "",
					targetBranch,
					mergeBase,
					changedFiles,
					forcedFullRunPattern: match.source,
					changedPackageCount: changed.packages.length,
				};
			}

			const historicalPackageJsonFiles = packageJsonFilesFromGitOutput(
				await git.raw("ls-tree", "-r", "--name-only", mergeBase),
			);
			const currentPackageJsonFiles = packageJsonFilesFromGitOutput(
				await git.raw("ls-files", "--", "package.json", "*/package.json"),
			);
			const packageDirs = buildPackageDirSet(
				mergeBase,
				() => historicalPackageJsonFiles,
				() => currentPackageJsonFiles,
			);

			if (!anyChangedFileInPackages(changedFiles, packageDirs)) {
				this.logWarning(
					`No changed files mapped to a workspace package - skipping all test execution. Files considered (${changedFiles.length}):`,
				);
				for (const file of changedFiles) {
					this.info(`  ${file}`);
				}
				this.emitVsoOutputs(false, "");
				return {
					shouldRunTests: false,
					scopedPnpmFilter: "",
					targetBranch,
					mergeBase,
					changedFiles,
					changedPackageCount: 0,
				};
			}

			const scopedPnpmFilter = `...[${mergeBase}]`;
			this.info(`Computed pnpm filter: ${scopedPnpmFilter}`);
			this.emitVsoOutputs(true, scopedPnpmFilter);
			return {
				shouldRunTests: true,
				scopedPnpmFilter,
				targetBranch,
				mergeBase,
				changedFiles,
				changedPackageCount: changed.packages.length,
			};
		} catch (error) {
			return this.fallbackFullRun(
				error instanceof Error ? `${error.message};` : `${String(error)};`,
				targetBranch,
			);
		}
	}

	private emitVsoOutputs(shouldRunTests: boolean, scopedPnpmFilter: string): void {
		if (this.jsonEnabled()) {
			return;
		}

		const flag = shouldRunTests ? "true" : "false";
		this.log(`shouldRunTests=${flag}`);
		this.log(`scopedPnpmFilter=${scopedPnpmFilter}`);
		this.log(`##vso[task.setvariable variable=shouldRunTests;isOutput=true]${flag}`);
		this.log(
			`##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]${scopedPnpmFilter}`,
		);
	}

	private logWarning(message: string): void {
		if (!this.jsonEnabled()) {
			this.log(`##vso[task.logissue type=warning]${message}`);
		}
	}

	private fallbackFullRun(reason: string, targetBranch: string): ChangedPackagesResult {
		this.logWarning(`${reason} Falling back to full test run.`);
		this.emitVsoOutputs(true, "");
		return {
			shouldRunTests: true,
			scopedPnpmFilter: "",
			targetBranch,
			changedFiles: [],
			changedPackageCount: 0,
		};
	}
}
