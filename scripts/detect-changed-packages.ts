/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * detect-changed-packages
 *
 * Decides whether a PR's diff warrants scoping downstream test execution to a
 * subset of workspace packages. Emits two ADO output variables:
 *
 *   shouldRunTests    "true" | "false"  — whether any test work is needed
 *   scopedPnpmFilter  pnpm filter string "...[<sha>]" when scoping is active,
 *                     empty when a full test run is required. Downstream jobs
 *                     pass this verbatim into `npm_config_filter`; pnpm treats
 *                     an empty value as "no filter applied" so recursive `-r`
 *                     runs fall back to the historical every-package behavior.
 *
 * Safe-fallback policy: any unexpected error (missing merge-base, git failure,
 * unparseable ref) MUST result in a full run — never a silent skip. An
 * accidental silent skip would suppress all tests and hide real regressions.
 *
 * Why merge-base (and not just `origin/<branch>` directly): pnpm's
 * `--filter "[ref]"` uses a two-dot diff internally (see pnpm/pnpm#9907), so
 * commits that landed on `origin/<branch>` after this PR diverged would show
 * up as "changed." Computing the merge-base SHA ourselves and feeding that
 * SHA into the selector gives three-dot (merge-base) semantics.
 *
 * This module exports pure helpers so the decision logic can be unit tested
 * without an ADO pipeline context or a populated git repo.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, type Dirent } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Full-run trigger patterns. A diff touching any of these paths forces running
 * every package's tests (filter stays empty → pnpm -r runs across the whole
 * workspace). Keep this list conservative — it's the safety net for changes
 * that could plausibly invalidate assumptions across the entire workspace.
 *
 * This list partially overlaps with `pr: paths: include:` in
 * tools/pipelines/build-client.yml (which decides whether the pipeline runs
 * at all). The concepts differ — one gates the pipeline, the other gates
 * scoping within a pipeline that's already running — but adding a new
 * cross-cutting root-level file generally warrants updating both. There's no
 * programmatic link, so keep them in sync by convention.
 */
export const FULL_RUN_PATTERNS: readonly RegExp[] = [
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

/** Azure Repos emits "refs/heads/main"; GitHub emits just "main". Normalize. */
export function normalizeTargetBranch(branch: string): string {
	return branch.replace(/^refs\/heads\//, "");
}

/**
 * Return the first pattern that any of the given files match, or `undefined`
 * if none match. Used by callers to surface *why* a full run was forced.
 */
export function checkFullRunPatterns(
	files: readonly string[],
	patterns: readonly RegExp[] = FULL_RUN_PATTERNS,
): RegExp | undefined {
	for (const pattern of patterns) {
		if (files.some((f) => pattern.test(f))) {
			return pattern;
		}
	}
	return undefined;
}

/**
 * Build the set of directories that hold (or held, at `mergeBase`) a
 * package.json. Unions the merge-base tree with the working tree so a
 * package DELETED on this branch still maps correctly — the reviewer-flagged
 * case the bash implementation missed.
 *
 * `listHistoricalPackages` and `listCurrentPackages` are injected so tests
 * can drive this logic without spinning up a real git repo.
 */
export function buildPackageDirSet(
	mergeBase: string,
	listHistoricalPackages: (ref: string) => readonly string[],
	listCurrentPackages: () => readonly string[],
): ReadonlySet<string> {
	const dirs = new Set<string>();
	const record = (file: string): void => {
		// file is like "packages/foo/package.json" or "package.json".
		const dir = path.posix.dirname(file);
		dirs.add(dir === "" ? "." : dir);
	};
	for (const f of listHistoricalPackages(mergeBase)) record(f);
	for (const f of listCurrentPackages()) record(f);
	return dirs;
}

/**
 * Return `true` if any changed file lives under a known package directory.
 * A file at `packages/foo/src/x.ts` matches if `packages/foo` (or any
 * ancestor above it, stopping at the root) is in `packageDirs`.
 *
 * The root pseudo-dir `"."` is deliberately ignored here: root-level package
 * changes are already caught by `FULL_RUN_PATTERNS` and should not double-
 * count as a per-package signal.
 */
export function findChangedPackages(
	changedFiles: readonly string[],
	packageDirs: ReadonlySet<string>,
): boolean {
	for (const file of changedFiles) {
		if (!file) continue;
		let dir = path.posix.dirname(file);
		while (dir !== "." && dir !== "/" && dir !== "") {
			if (packageDirs.has(dir)) {
				return true;
			}
			dir = path.posix.dirname(dir);
		}
	}
	return false;
}

/** Thin wrapper for `git` calls. Returns stdout or `undefined` on failure. */
function git(args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	} catch {
		return undefined;
	}
}

/** Git-backed implementation of `listHistoricalPackages`. */
function gitHistoricalPackages(ref: string): string[] {
	const out = git(["ls-tree", "-r", "--name-only", ref]);
	if (out === undefined) return [];
	return out.split("\n").filter((f) => /(^|\/)package\.json$/.test(f));
}

/** Walk the working tree for package.json files, skipping node_modules. */
function currentPackages(cwd: string = process.cwd()): string[] {
	const results: string[] = [];
	const walk = (dir: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name === "package.json") {
				results.push(path.relative(cwd, full).split(path.sep).join("/"));
			}
		}
	};
	walk(cwd);
	return results;
}

function emitVsoOutputs(shouldRunTests: boolean, scopedPnpmFilter: string): void {
	const flag = shouldRunTests ? "true" : "false";
	console.log(`shouldRunTests=${flag}`);
	console.log(`scopedPnpmFilter=${scopedPnpmFilter}`);
	console.log(`##vso[task.setvariable variable=shouldRunTests;isOutput=true]${flag}`);
	console.log(`##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]${scopedPnpmFilter}`);
}

function logWarning(message: string): void {
	console.log(`##vso[task.logissue type=warning]${message}`);
}

/** Pipeline entry point. Reads TARGET_BRANCH from env, writes vso outputs. */
export function main(): void {
	const raw = process.env.TARGET_BRANCH ?? "";
	const targetBranch = normalizeTargetBranch(raw);
	if (!targetBranch) {
		logWarning("TARGET_BRANCH not set; falling back to full test run.");
		emitVsoOutputs(true, "");
		return;
	}
	console.log(`Target branch: ${targetBranch}`);

	if (git(["fetch", "origin", targetBranch]) === undefined) {
		logWarning(`Could not fetch origin/${targetBranch}; falling back to full test run.`);
		emitVsoOutputs(true, "");
		return;
	}

	// Try to resolve the merge-base in the shallow clone first. If the PR
	// diverged further back than the shallow boundary, unshallow and retry
	// once. `.git/shallow` is how git marks a shallow repo; skip the
	// unshallow on a full clone (which would error with "--unshallow on a
	// complete repository").
	let mergeBase = git(["merge-base", "HEAD", `origin/${targetBranch}`])?.trim();
	const gitDir = git(["rev-parse", "--git-dir"])?.trim();
	if (!mergeBase && gitDir && existsSync(path.join(gitDir, "shallow"))) {
		console.log("Merge-base not found in shallow clone; unshallowing and retrying.");
		git(["fetch", "--unshallow", "origin", targetBranch]);
		mergeBase = git(["merge-base", "HEAD", `origin/${targetBranch}`])?.trim();
	}
	if (!mergeBase) {
		logWarning(`No merge-base with origin/${targetBranch}; falling back to full test run.`);
		emitVsoOutputs(true, "");
		return;
	}
	console.log(`Merge base: ${mergeBase}`);

	// On diff failure, fall back to a full run rather than swallowing the
	// error — an empty changed-files list would bypass the full-run patterns
	// and the package-change check, silently suppressing all test jobs.
	const diffOut = git(["diff", "--name-only", mergeBase]);
	if (diffOut === undefined) {
		logWarning(`git diff against merge-base ${mergeBase} failed; falling back to full test run.`);
		emitVsoOutputs(true, "");
		return;
	}
	const changedFiles = diffOut.split("\n").filter((f) => f.length > 0);
	console.log(`Changed files (${changedFiles.length}):`);
	for (const f of changedFiles.slice(0, 30)) console.log(f);
	if (changedFiles.length > 30) console.log(`... and ${changedFiles.length - 30} more`);

	const match = checkFullRunPatterns(changedFiles);
	if (match !== undefined) {
		console.log(`Match for full-run pattern '${match.source}' — forcing full test run.`);
		emitVsoOutputs(true, "");
		return;
	}

	const packageDirs = buildPackageDirSet(mergeBase, gitHistoricalPackages, currentPackages);
	if (!findChangedPackages(changedFiles, packageDirs)) {
		// Most aggressive skip path: no test jobs run. Surface as a pipeline
		// warning (not plain console output) and dump the file list so an
		// accidental silent-suppression bug is auditable from the pipeline
		// summary without needing to re-run the build.
		logWarning(
			`No changed files mapped to a workspace package — skipping all test execution. Files considered (${changedFiles.length}):`,
		);
		for (const f of changedFiles) console.log(`  ${f}`);
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

// Run main only when invoked directly, not when imported by tests.
// fileURLToPath avoids Windows drive-letter mismatches that caught older
// `process.argv[1]`-based guards.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
