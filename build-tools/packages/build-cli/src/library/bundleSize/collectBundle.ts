/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { findGitRootSync } from "@fluid-tools/build-infrastructure";
import { simpleGit } from "simple-git";

/**
 * Options for {@link collectBundle}.
 */
export interface CollectBundleOptions {
	/**
	 * `local`: collect from the outer enlistment that contains {@link CollectBundleOptions.packageDir}.
	 * `revision`: collect from a separate inner enlistment checked out at {@link CollectBundleOptions.revision}.
	 *
	 * In `local` mode the outer enlistment is built exactly as it sits on disk: its git state
	 * (working tree, branch, and revision) is never modified. All checkout/fetch happens only in
	 * the inner repo used by `revision` mode.
	 */
	readonly mode: "local" | "revision";
	/**
	 * (revision mode only) Committish to build in the inner repo (branch, tag, commit SHA, or any
	 * committish like `HEAD~2`). Combined with {@link CollectBundleOptions.resolution} to pick the
	 * commit that is built. Resolved against the outer repo. Also used as the default label.
	 */
	readonly revision?: string;
	/**
	 * (revision mode only) How {@link CollectBundleOptions.revision} is resolved to the commit that
	 * is built: `exact` uses the committish as-is (via `git rev-parse`); `merge-base` uses its
	 * merge-base with HEAD (the fork point). Defaults to `merge-base`. Ignored in local mode.
	 */
	readonly resolution?: "exact" | "merge-base";
	/**
	 * Directory name (under {@link CollectBundleOptions.analysisDir}) to save the collected bundle
	 * stats into. Sanitized for filesystem use before being applied. Defaults to the sanitized
	 * revision in revision mode, or a timestamped `current_<epoch>` in local mode.
	 */
	readonly label?: string;
	/**
	 * Run the full workspace clean (`npm run clean` at the repo root) before building.
	 */
	readonly forceCleanBuild: boolean;
	/**
	 * Package root whose webpack bundles are built and whose `analyzer.json` is collected.
	 */
	readonly packageDir: string;
	/**
	 * Directory under which per-label analyzer stats are saved.
	 */
	readonly analysisDir: string;
	/**
	 * (revision mode only) Directory where the inner enlistment is cloned and built. Defaults to
	 * `<analysisDir>/base-repo` when not specified.
	 */
	readonly baseRepoDir?: string;
}

/**
 * Sanitizes a string for use as a filename.
 */
function sanitizeForFileName(value: string): string {
	return value.replaceAll(/[^\w.-]/g, "_");
}

/**
 * Resolves the merge-base (best common ancestor) of two committishes (branch,
 * tag, or SHA). Returns the full SHA, or undefined if either rev cannot be
 * resolved (e.g. unknown branch, detached state with no shared history).
 *
 * `otherRev` defaults to `HEAD`. The two-commit form of `git merge-base` is
 * symmetric — per the git documentation, `git merge-base a b` outputs a commit
 * reachable from both `a` and `b`, so argument order does not affect the result
 * (order only matters for the 3+ commit and `--fork-point` forms, which we do
 * not use here).
 *
 * Using merge-base instead of a raw branch tip means the comparison is taken
 * against the actual fork point, which is what users typically want — and it
 * works for worktree-based setups where `main` may not exist as a local branch
 * at the location they expect.
 */
async function resolveMergeBase(
	repoRoot: string,
	rev: string,
	otherRev = "HEAD",
): Promise<string | undefined> {
	try {
		const output = await simpleGit(repoRoot).raw(["merge-base", rev, otherRev]);
		const sha = output.trim();
		return sha.length > 0 ? sha : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolves a committish (branch, tag, or SHA) to its full commit SHA via
 * `git rev-parse <rev>^{commit}`. Unlike {@link resolveMergeBase}, the revision
 * is used exactly as given (no fork-point computation). Throws if the revision
 * cannot be resolved locally, with guidance to fetch it first.
 *
 * The `^{commit}` peel ensures annotated tags resolve to the underlying commit
 * rather than the tag object.
 */
async function resolveSha(repoRoot: string, rev: string): Promise<string> {
	try {
		const output = await simpleGit(repoRoot).raw(["rev-parse", `${rev}^{commit}`]);
		const sha = output.trim();
		if (sha.length > 0) return sha;
	} catch {
		// Fall through to the shared error below.
	}
	throw new Error(
		`Could not resolve revision "${rev}" to a commit. ` +
			`Ensure it exists locally (e.g. "git fetch origin ${rev}").`,
	);
}

/**
 * Runs a command inheriting stdio, throwing on failure.
 */
function run(command: string, cwd: string): void {
	execSync(command, { cwd, stdio: "inherit" });
}

/**
 * Enables corepack and installs dependencies in the given repo.
 */
function installDependencies(repoRoot: string): void {
	console.log(`Enabling corepack and installing dependencies in ${repoRoot}...`);
	run("corepack enable", repoRoot);
	run("pnpm install", repoRoot);
}

/**
 * Runs the repo-root `clean` script, which invokes `fluid-build --task clean` across
 * the entire client release group. This is the only reliable way to clear stale
 * build artifacts for every transitive dependency of bundle-size-tests:
 *
 * - `fluid-build . --task clean` (scoped to this package) does NOT cascade into dependencies, because the `clean` task in fluidBuild.config.cjs has no `^clean`.
 * - The per-package `clean` npm scripts only remove outputs in their own package.
 */
function cleanWorkspace(repoRoot: string): void {
	console.log(`\nCleaning workspace build artifacts in ${repoRoot}...`);
	run("npm run clean", repoRoot);
}

/**
 * Compiles this package and its transitive dependencies so webpack has the
 * `lib/` outputs it needs. Uses `build:compile` to avoid the lint / docs / api-report
 * tasks pulled in by the full `build` target, which are unnecessary for bundle
 * collection and prone to unrelated failures across revisions.
 */
function buildWorkspace(packageRoot: string): void {
	console.log(`\nCompiling bundle-size-tests and its dependencies in ${packageRoot}...`);
	run("npm run build:compile", packageRoot);
}

/**
 * Builds bundles using webpack inside the given package root.
 */
function buildBundles(packageRoot: string): void {
	console.log(`\nBuilding bundles with webpack in ${packageRoot}...`);
	run("npm run webpack", packageRoot);
}

/**
 * Saves webpack-bundle-analyzer's JSON report into the per-label directory under
 * the persistent analysis root. This `analyzer.json` carries per-asset
 * parsed/gzip sizes and entrypoint membership, which is everything
 * compareBundles.ts needs — so the (large) webpack stats and `build/` outputs
 * do not need to be retained.
 *
 * @remarks
 * Uses copy + unlink instead of `renameSync` because the source and destination
 * may live on different drives (e.g. `D:` -> `C:\Users\<user>\AppData\Local\Temp`),
 * which causes `renameSync` to fail with `EXDEV` on Windows.
 *
 * @param label - Sanitized label for this build (e.g., "main", "client_v2.100.0").
 * @param sourcePackageRoot - Package root that produced the webpack output.
 * @param analysisDir - Directory under which per-label stats are saved.
 */
function saveStats(label: string, sourcePackageRoot: string, analysisDir: string): void {
	const analyzerJsonOutputPath = resolve(
		sourcePackageRoot,
		"bundleAnalyzerJson",
		"analyzer.json",
	);

	const labelDirectory = resolve(analysisDir, label);
	const destAnalyzerPath = resolve(labelDirectory, "analyzer.json");

	if (!existsSync(analyzerJsonOutputPath)) {
		throw new Error(
			`Analyzer report not found at ${analyzerJsonOutputPath}. ` +
				`Check that webpack ran successfully.`,
		);
	}

	mkdirSync(labelDirectory, { recursive: true });
	copyFileSync(analyzerJsonOutputPath, destAnalyzerPath);
	unlinkSync(analyzerJsonOutputPath);
	console.log(`Saved analyzer report to: ${destAnalyzerPath}`);
}

/**
 * Captures the outer repo's currently-staged diff to a sibling file next to
 * the bundle stats, so the analysis is reproducible even with uncommitted
 * changes. Only staged changes are recorded; unstaged changes are intentionally
 * excluded (they're often noisy / random) but a warning is printed if any are
 * detected so the user can `git add` the relevant pieces and re-run.
 *
 * This is purely a record: the patch is never applied, and the outer repo's
 * working tree and revision are left untouched. Local mode builds the enlistment
 * exactly as it sits on disk.
 *
 * The patch is written as `staged-changes.patch` inside the per-label directory.
 */
async function captureLocalPatch(repoRoot: string, labelDirectory: string): Promise<void> {
	const git = simpleGit(repoRoot);
	const stagedDiff = await git.diff(["--cached"]);
	const unstagedDiff = await git.diff();
	if (unstagedDiff.length > 0) {
		console.warn(
			`Warning: unstaged changes detected in ${repoRoot}. They will NOT be ` +
				`captured in the patch alongside this analysis. Stage all changes you ` +
				`want recorded (e.g. "git add -u") before collecting so the ` +
				`patch faithfully describes what was bundled.`,
		);
	}
	mkdirSync(labelDirectory, { recursive: true });
	const patchPath = resolve(labelDirectory, "staged-changes.patch");
	writeFileSync(patchPath, stagedDiff);
	console.log(`Saved staged-changes patch to: ${patchPath}`);
}

/**
 * Ensures the inner FluidFramework enlistment exists under `innerRepoRoot` and
 * is checked out at the given commit SHA.
 *
 * @remarks
 * On first call, clones the inner repo directly from the outer enlistment on
 * disk (`--no-tags --no-checkout`). Because the source is a local repository, no
 * remote or network access is involved and every commit already present in the
 * outer repo (including merge-base SHAs that aren't branch tips) is available
 * without a separate fetch. `--no-checkout` is used because the SHA is checked
 * out explicitly afterwards.
 *
 * The SHA is checked out with a detached HEAD, so there is no local branch state
 * to manage. Callers resolve the user's revision to a SHA in the outer repo
 * before calling, so any committish — branch, tag, or relative ref such as
 * `HEAD^4` — is handled uniformly here.
 *
 * Never modifies the outer repo's working tree, branch, or stash.
 */
async function ensureInnerRepoAtRevision(
	sha: string,
	outerRepoRoot: string,
	innerRepoRoot: string,
): Promise<void> {
	if (!existsSync(resolve(innerRepoRoot, ".git"))) {
		mkdirSync(dirname(innerRepoRoot), { recursive: true });
		console.log(`\nCloning inner repo from ${outerRepoRoot} into ${innerRepoRoot}...`);
		await simpleGit(dirname(innerRepoRoot)).clone(outerRepoRoot, innerRepoRoot, [
			"--no-tags",
			"--no-checkout",
		]);
	}

	console.log(`Checking out ${sha} in inner repo...`);
	await simpleGit(innerRepoRoot).raw(["checkout", "--detach", sha]);
}

/**
 * Logs the standard "collection complete" banner.
 */
function logCollectionComplete(mode: string, label: string, labelDirectory: string): void {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`✓ Bundle collection complete (mode: ${mode}, label: ${label}).`);
	console.log(`  Stats directory: ${labelDirectory}`);
	console.log("=".repeat(80));
}

/**
 * Collects a single bundle from either the outer enlistment (local mode) or a
 * separate inner enlistment checked out to a specific revision (revision mode),
 * and returns the (sanitized) label its stats were saved under.
 *
 * @remarks
 * In revision mode, the user's {@link CollectBundleOptions.revision} is resolved to a concrete
 * commit SHA in the outer repo — its merge-base with HEAD (the fork point) or the committish
 * as-is, per {@link CollectBundleOptions.resolution}. The inner repo (at
 * {@link CollectBundleOptions.baseRepoDir}, defaulting to `<analysisDir>/base-repo`) is cloned from
 * the outer enlistment on disk on first use and reused thereafter. No remote or network access is
 * involved.
 *
 * Because a clean revision builds deterministically, the resolved SHA is recorded in a sidecar
 * `revision.txt` next to the stats; a later run that resolves to the same SHA reuses the cached
 * report and skips the rebuild (unless {@link CollectBundleOptions.forceCleanBuild} is set).
 *
 * In local mode the outer enlistment is built exactly as it sits on disk: its working tree and
 * revision are never checked out, stashed, or otherwise mutated. The captured patch is therefore
 * only a reproducibility record of what was staged at collection time — it is never applied. It is
 * captured up front, before any build steps, so it is preserved even if the build subsequently
 * fails.
 *
 * The outer repo's working tree, branch, and stash are never modified.
 */
export async function collectBundle(options: CollectBundleOptions): Promise<string> {
	const {
		mode,
		revision,
		resolution = "merge-base",
		forceCleanBuild,
		packageDir,
		analysisDir,
	} = options;

	if (mode === "revision" && (revision === undefined || revision.length === 0)) {
		throw new Error("revision mode requires a revision.");
	}

	const label = sanitizeForFileName(
		options.label ??
			(mode === "revision"
				? (revision as string)
				: `current_${Math.floor(Date.now() / 1000)}`),
	);

	const outerRepoRoot = findGitRootSync(packageDir);
	const innerRepoRoot = options.baseRepoDir ?? resolve(analysisDir, "base-repo");
	const labelDirectory = resolve(analysisDir, label);

	let activeRepoRoot: string;
	let activePackageRoot: string;
	// Set in revision mode to the resolved SHA, recorded alongside the stats so a
	// later run against the same revision can reuse the report. Undefined in local mode.
	let resolvedRevision: string | undefined;

	if (mode === "local") {
		activeRepoRoot = outerRepoRoot;
		activePackageRoot = packageDir;
		await captureLocalPatch(outerRepoRoot, labelDirectory);
	} else {
		// Resolve the user's revision to a concrete SHA in the outer repo: the
		// merge-base with HEAD (the fork point), or the committish as-is for "exact".
		if (resolution === "exact") {
			resolvedRevision = await resolveSha(outerRepoRoot, revision as string);
		} else {
			const mergeBase = await resolveMergeBase(outerRepoRoot, revision as string);
			if (mergeBase === undefined) {
				throw new Error(
					`Could not find merge-base of HEAD and "${revision as string}". ` +
						`Ensure the revision exists locally (e.g. "git fetch origin ${revision as string}").`,
				);
			}
			resolvedRevision = mergeBase;
		}
		if (resolvedRevision !== revision) {
			console.log(
				`Resolved revision "${revision as string}" to ` +
					`${resolution === "exact" ? "" : "merge-base "}${resolvedRevision}.`,
			);
		}

		// Reuse a previously-collected report when the recorded SHA matches.
		const analyzerPath = resolve(labelDirectory, "analyzer.json");
		const revisionMarkerPath = resolve(labelDirectory, "revision.txt");
		const cachedRevision = existsSync(revisionMarkerPath)
			? readFileSync(revisionMarkerPath, "utf8").trim()
			: undefined;
		if (!forceCleanBuild && existsSync(analyzerPath) && cachedRevision === resolvedRevision) {
			console.log(`Reusing cached bundle (revision: ${resolvedRevision}, label: ${label}).`);
			console.log(`  Report: ${analyzerPath}`);
			logCollectionComplete(mode, label, labelDirectory);
			return label;
		}

		// Locate the same package inside the inner repo via its path relative to
		// the repo root (e.g. `examples/utils/bundle-size-tests`).
		const packageWorkspacePath = relative(outerRepoRoot, packageDir);
		await ensureInnerRepoAtRevision(resolvedRevision, outerRepoRoot, innerRepoRoot);
		activeRepoRoot = innerRepoRoot;
		activePackageRoot = resolve(innerRepoRoot, packageWorkspacePath);
		if (!existsSync(activePackageRoot)) {
			throw new Error(
				`Expected package not found in inner repo at ${activePackageRoot}. ` +
					`The revision "${revision as string}" may predate this package.`,
			);
		}
		installDependencies(activeRepoRoot);
	}

	if (forceCleanBuild) {
		cleanWorkspace(activeRepoRoot);
	}
	buildWorkspace(activePackageRoot);
	buildBundles(activePackageRoot);
	saveStats(label, activePackageRoot, analysisDir);
	// Record the SHA so a later run against the same revision can skip the rebuild.
	if (resolvedRevision !== undefined) {
		writeFileSync(resolve(labelDirectory, "revision.txt"), `${resolvedRevision}\n`);
	}

	logCollectionComplete(mode, label, labelDirectory);
	return label;
}
