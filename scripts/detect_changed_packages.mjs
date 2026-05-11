#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { dirname } from "node:path/posix";

/**
 * Decides whether a PR's diff warrants scoping downstream test execution to a
 * subset of workspace packages. Emits two ADO output variables:
 *
 *   shouldRunTests    "true" | "false" - whether any test work is needed
 *   scopedPnpmFilter  pnpm filter string "...[<sha>]" when scoping is active,
 *                     empty when a full test run is required. Downstream jobs
 *                     pass this verbatim into npm_config_filter; pnpm treats
 *                     an empty value as "no filter applied" so recursive -r
 *                     runs fall back to the historical every-package behavior.
 *
 * Safe-fallback policy: any unexpected error (missing merge-base, git failure,
 * unparseable ref) MUST result in a full run - never a silent skip. An
 * accidental silent skip would suppress all tests and hide real regressions.
 *
 * Why merge-base (and not just origin/<branch> directly): pnpm's
 * --filter "[ref]" uses a two-dot diff internally (see pnpm/pnpm#9907), so
 * commits that landed on origin/<branch> after this PR diverged would show up
 * as "changed." Computing the merge-base SHA ourselves and feeding that SHA
 * into the selector gives three-dot (merge-base) semantics.
 */

// Full-run trigger patterns. A diff touching any of these paths forces running
// every package's tests (filter stays empty, so pnpm -r runs across the whole
// workspace). Keep this list conservative: it's the safety net for changes
// that could plausibly invalidate assumptions across the entire workspace.
//
// This list partially overlaps with `pr: paths: include:` in
// tools/pipelines/build-client.yml (which decides whether the pipeline runs
// at all). The concepts differ - one gates the pipeline, the other gates
// scoping within a pipeline that's already running - but adding a new
// cross-cutting root-level file generally warrants updating both. There's no
// programmatic link, so keep them in sync by convention.
export const FULL_RUN_PATTERNS = [
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

export function normalizeTargetBranch(branch) {
	const prefix = "refs/heads/";
	return branch.startsWith(prefix) ? branch.slice(prefix.length) : branch;
}

export function checkFullRunPatterns(files, patterns = FULL_RUN_PATTERNS) {
	for (const pattern of patterns) {
		if (files.some((file) => pattern.test(file))) {
			return pattern;
		}
	}
	return undefined;
}

export function buildPackageDirSet(mergeBase, listHistoricalPackages, listCurrentPackages) {
	const dirs = new Set();
	for (const file of listHistoricalPackages(mergeBase)) {
		dirs.add(dirname(file));
	}
	for (const file of listCurrentPackages()) {
		dirs.add(dirname(file));
	}
	return dirs;
}

export function anyChangedFileInPackages(changedFiles, packageDirs) {
	for (const file of changedFiles) {
		if (!file) {
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

function git(args) {
	const result = spawnSync("git", args, { encoding: "utf8" });
	if (result.error !== undefined) {
		logWarning(`git executable not found: ${result.error.message}`);
		return undefined;
	}
	if (result.status !== 0) {
		const stderr = (result.stderr ?? "").trim();
		logWarning(`git ${args.join(" ")} failed (exit ${result.status}): ${stderr}`);
		return undefined;
	}
	return result.stdout;
}

const packageJsonPattern = /(^|\/)package\.json$/;

function gitHistoricalPackages(ref) {
	const out = git(["ls-tree", "-r", "--name-only", ref]);
	if (out === undefined) {
		return [];
	}
	return out.split("\n").filter((file) => packageJsonPattern.test(file));
}

function currentPackages() {
	const out = git(["ls-files", "--", "package.json", "*/package.json"]);
	if (out === undefined) {
		return [];
	}
	return out.split("\n").filter((file) => packageJsonPattern.test(file));
}

function emitVsoOutputs(shouldRunTests, scopedPnpmFilter) {
	const flag = shouldRunTests ? "true" : "false";
	console.log(`shouldRunTests=${flag}`);
	console.log(`scopedPnpmFilter=${scopedPnpmFilter}`);
	console.log(`##vso[task.setvariable variable=shouldRunTests;isOutput=true]${flag}`);
	console.log(
		`##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]${scopedPnpmFilter}`,
	);
}

function logWarning(message) {
	console.log(`##vso[task.logissue type=warning]${message}`);
}

function fallbackFullRun(reason) {
	logWarning(`${reason} Falling back to full test run.`);
	emitVsoOutputs(true, "");
}

function resolveMergeBase(targetBranch) {
	const firstMergeBase = git(["merge-base", "HEAD", `origin/${targetBranch}`])?.trim();
	if (firstMergeBase) {
		return firstMergeBase;
	}

	const isShallow = git(["rev-parse", "--is-shallow-repository"])?.trim();
	if (isShallow !== "true") {
		return undefined;
	}

	console.log("Merge-base not found in shallow clone; deepening and retrying.");
	git(["fetch", "--deepen", "1000", "origin", targetBranch]);
	return git(["merge-base", "HEAD", `origin/${targetBranch}`])?.trim() || undefined;
}

export function main() {
	const targetBranch = normalizeTargetBranch(process.env.TARGET_BRANCH ?? "");
	if (!targetBranch) {
		fallbackFullRun("TARGET_BRANCH not set;");
		return;
	}
	console.log(`Target branch: ${targetBranch}`);

	if (git(["fetch", "origin", targetBranch]) === undefined) {
		fallbackFullRun(`Could not fetch origin/${targetBranch};`);
		return;
	}

	const mergeBase = resolveMergeBase(targetBranch);
	if (!mergeBase) {
		fallbackFullRun(`No merge-base with origin/${targetBranch};`);
		return;
	}
	console.log(`Merge base: ${mergeBase}`);

	// Diff merge_base..HEAD (commit-only, immune to working-tree mutations
	// from any future pre-step). On diff failure, fall back to a full run:
	// an empty changed-files list would bypass full-run patterns and the
	// package-change check, silently suppressing all test jobs.
	const diffOut = git(["diff", "--name-only", mergeBase, "HEAD"]);
	if (diffOut === undefined) {
		fallbackFullRun(`git diff against merge-base ${mergeBase} failed;`);
		return;
	}

	const changedFiles = diffOut.split("\n").filter(Boolean);
	console.log(`Changed files (${changedFiles.length}):`);
	for (const file of changedFiles.slice(0, 30)) {
		console.log(file);
	}
	if (changedFiles.length > 30) {
		console.log(`... and ${changedFiles.length - 30} more`);
	}

	const match = checkFullRunPatterns(changedFiles);
	if (match !== undefined) {
		console.log(`Match for full-run pattern '${match.source}' - forcing full test run.`);
		emitVsoOutputs(true, "");
		return;
	}

	const packageDirs = buildPackageDirSet(mergeBase, gitHistoricalPackages, currentPackages);
	if (!anyChangedFileInPackages(changedFiles, packageDirs)) {
		logWarning(
			`No changed files mapped to a workspace package - skipping all test execution. Files considered (${changedFiles.length}):`,
		);
		for (const file of changedFiles) {
			console.log(`  ${file}`);
		}
		emitVsoOutputs(false, "");
		return;
	}

	// Hand the merge-base SHA to pnpm's native selector. The leading `...`
	// pulls in transitive dependents so consumers of a changed package also
	// get re-tested.
	const filter = `...[${mergeBase}]`;
	console.log(`Computed pnpm filter: ${filter}`);
	emitVsoOutputs(true, filter);
}

if (
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main();
	process.exit(0);
}
