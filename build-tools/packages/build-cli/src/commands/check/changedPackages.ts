/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import {
	getChangedSinceRef,
	getMergeBaseRemote,
	getPackageDirsAtRef,
	getRemote,
	isFileInPackageDir,
} from "@fluid-tools/build-infrastructure";
import { Flags } from "@oclif/core";

import {
	formatLogIssue,
	formatSetVariable,
} from "../../library/azureDevops/pipelineCommands.js";
import { normalizeTargetBranch } from "../../library/branches.js";
import { BaseCommandWithBuildProject } from "../../library/commands/base.js";

/**
 * Full-run trigger patterns. A diff touching any of these paths forces running
 * every package's tests. Keep this conservative since these files can affect
 * dependency resolution, build behavior, or pipeline behavior across packages.
 */
const fullRunPatterns: readonly RegExp[] = [
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

/**
 * Result of computing which packages have changed since the target branch.
 *
 * The same shape is returned both for full-run fallbacks (e.g. unexpected errors or trigger-pattern
 * matches) and for the normal scoped-filter case. Consumers can inspect {@link forcedFullRunPattern}
 * to disambiguate.
 */
export interface ChangedPackagesResult {
	/** Whether any tests should run at all. `false` only when no changed file maps to a workspace package. */
	shouldRunTests: boolean;
	/** The computed `pnpm --filter` expression, or an empty string for full / no-op runs. */
	scopedPnpmFilter: string;
	/** The (normalized) target branch the comparison was performed against. */
	targetBranch: string;
	/** The merge-base commit between HEAD and the target branch, when it could be determined. */
	mergeBase?: string;
	/** The list of files that changed since the merge base. Empty on the error fallback path. */
	changedFiles: string[];
	/** The source of the first {@link fullRunPatterns} entry that matched a changed file, if any. */
	forcedFullRunPattern?: string;
	/** Number of workspace packages reported as changed by `getChangedSinceRef`. */
	changedPackageCount: number;
}

/**
 * Returns the first pattern in `patterns` that matches any path in `files`, or `undefined` if
 * none match.
 */
function findFullRunPatternMatch(
	files: readonly string[],
	patterns: readonly RegExp[],
): RegExp | undefined {
	for (const pattern of patterns) {
		if (files.some((file) => pattern.test(file))) {
			return pattern;
		}
	}
	return undefined;
}

export default class CheckChangedPackagesCommand extends BaseCommandWithBuildProject<
	typeof CheckChangedPackagesCommand
> {
	static readonly summary =
		"Computes Azure DevOps output variables used by pipelines to conditionally skip tests.";

	static readonly description =
		"Compares the current PR branch to the merge base with a target branch, then emits 'shouldRunTests' and 'scopedPnpmFilter' as Azure DevOps output variables. Unexpected errors conservatively fall back to a full test run.";

	static readonly enableJsonFlag = true;

	static readonly flags = {
		targetBranch: Flags.string({
			description:
				"Target branch to compare against. Defaults to the TARGET_BRANCH environment variable.",
			env: "TARGET_BRANCH",
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
			const mergeBase = await getMergeBaseRemote(
				git,
				targetBranch,
				remote,
				"HEAD",
				(message) => this.info(message),
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

			const match = findFullRunPatternMatch(changedFiles, fullRunPatterns);
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

			// Union of package directories at the merge-base tree and the current working tree so
			// that packages added, removed, or moved between the two refs are all considered.
			const historicalDirs = await getPackageDirsAtRef(git, mergeBase);
			const currentDirs = await getPackageDirsAtRef(git);
			const packageDirs = new Set([...historicalDirs, ...currentDirs]);

			if (!changedFiles.some((file) => isFileInPackageDir(file, packageDirs))) {
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
		this.log(formatSetVariable("shouldRunTests", flag, { isOutput: true }));
		this.log(formatSetVariable("scopedPnpmFilter", scopedPnpmFilter, { isOutput: true }));
	}

	private logWarning(message: string): void {
		if (!this.jsonEnabled()) {
			this.log(formatLogIssue("warning", message));
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
