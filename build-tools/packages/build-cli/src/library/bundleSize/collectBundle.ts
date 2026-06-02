/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { simpleGit } from "simple-git";

/**
 * Options for {@link collectBundle}.
 */
export interface CollectBundleOptions {
	/**
	 * `local`: collect from the outer enlistment that contains {@link CollectBundleOptions.packageDir}.
	 * `revision`: collect from a separate inner enlistment checked out at {@link CollectBundleOptions.revision}.
	 */
	readonly mode: "local" | "revision";
	/**
	 * (revision mode only) Branch, tag, or commit SHA to check out in the inner repo before building.
	 */
	readonly revision?: string;
	/**
	 * Directory name (under {@link CollectBundleOptions.analysisDir}) to save the collected bundle
	 * stats into. Sanitized for filesystem use before being applied.
	 */
	readonly label: string;
	/**
	 * Run the full workspace clean (`npm run clean` at the repo root) before building.
	 */
	readonly forceCleanBuild: boolean;
	/**
	 * Package root whose webpack bundles are built and whose `analyzer.json` is collected.
	 */
	readonly packageDir: string;
	/**
	 * Directory under which per-label analyzer stats are saved. The inner enlistment used for
	 * revision mode lives at `<analysisDir>/base-repo`.
	 */
	readonly analysisDir: string;
}

/**
 * Gets the repository root directory for the given working directory.
 */
async function getRepoRoot(cwd: string): Promise<string> {
	const output = await simpleGit(cwd).revparse(["--show-toplevel"]);
	return output.trim();
}

/**
 * Returns the path of the given directory relative to the root of the repo that contains it,
 * e.g. `examples/utils/bundle-size-tests`. Used to locate the same package inside a
 * freshly-cloned inner repo.
 */
async function getPackageWorkspacePath(packageDir: string): Promise<string> {
	const output = await simpleGit(packageDir).revparse(["--show-prefix"]);
	// `--show-prefix` returns a trailing-slash-terminated path (or empty string at the repo root).
	return output.trim().replace(/\/$/, "");
}

/**
 * Sanitizes a string for use as a filename.
 */
function sanitizeForFileName(value: string): string {
	return value.replaceAll(/[^\w.-]/g, "_");
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
	// Use copy + unlink instead of renameSync because the source and destination
	// may live on different drives (e.g. D: -> C:\Users\<user>\AppData\Local\Temp),
	// which causes renameSync to fail with EXDEV on Windows.
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
 * Returns the URL of the outer repo's `origin` remote, used as the source
 * for cloning the inner repo.
 */
async function getOuterOriginUrl(outerRepoRoot: string): Promise<string> {
	const { value } = await simpleGit(outerRepoRoot).getConfig("remote.origin.url");
	if (value === null || value.length === 0) {
		throw new Error(`Could not read remote.origin.url from ${outerRepoRoot}.`);
	}
	return value;
}

/**
 * Ensures the inner FluidFramework enlistment exists under `innerRepoRoot`
 * and is checked out at the requested revision.
 *
 * On first call, performs a shallow clone of the outer repo's `origin` remote
 * (`--depth=1 --no-tags --no-checkout`). On every call (including the first),
 * the requested revision is fetched shallowly (`fetch --depth=1 origin <rev>`)
 * and checked out detached. This keeps the inner repo's `.git` directory small
 * even after many revisions have been visited.
 *
 * Never modifies the outer repo's working tree, branch, or stash.
 */
async function ensureInnerRepoAtRevision(
	revision: string,
	outerRepoRoot: string,
	innerRepoRoot: string,
): Promise<void> {
	if (!existsSync(resolve(innerRepoRoot, ".git"))) {
		const originUrl = await getOuterOriginUrl(outerRepoRoot);
		mkdirSync(dirname(innerRepoRoot), { recursive: true });
		console.log(`\nShallow-cloning inner repo from ${originUrl} into ${innerRepoRoot}...`);
		// Clone shallow with no checkout: we'll fetch and check out the exact
		// revision the caller requested below. --filter=blob:none isn't needed
		// on top of --depth=1.
		await simpleGit(dirname(innerRepoRoot)).clone(originUrl, innerRepoRoot, [
			"--depth=1",
			"--no-tags",
			"--no-checkout",
		]);
	}

	const innerGit = simpleGit(innerRepoRoot);
	console.log(`\nFetching revision "${revision}" (shallow) into inner repo...`);
	// Fetch only the requested commit at depth 1. By naming the SHA directly
	// we skip fetching any branch tips first, which is what keeps the inner
	// repo's `.git` small. This relies on the server allowing fetch-by-SHA:
	// `uploadpack.allowReachableSHA1InWant` lets clients ask for any commit
	// reachable from an advertised ref (not just the ref tips themselves).
	// GitHub enables this on every repo; without it, we'd have to fetch a
	// branch and walk history to the SHA, defeating --depth=1 for any
	// non-tip commit (which is the common case here, since the merge-base
	// usually isn't `main` HEAD).
	await innerGit.fetch(["--depth=1", "origin", revision]);

	console.log(`Checking out revision "${revision}" in inner repo...`);
	// Use detached HEAD checkout so we don't have to manage local branch state.
	// FETCH_HEAD is set by the fetch above and is guaranteed to point at the
	// requested commit, even when `revision` is a SHA the local clone hasn't
	// otherwise heard of.
	await innerGit.raw(["checkout", "--detach", "FETCH_HEAD"]);
}

/**
 * Collects a single bundle from either the outer enlistment (local mode) or a
 * separate inner enlistment checked out to a specific revision (revision mode).
 *
 * In revision mode, the inner repo at `<analysisDir>/base-repo` is cloned from the
 * outer repo's `origin` remote on first use and reused thereafter. The outer
 * repo's working tree, branch, and stash are never modified.
 */
export async function collectBundle(options: CollectBundleOptions): Promise<void> {
	const { mode, revision, forceCleanBuild, packageDir, analysisDir } = options;

	if (mode === "revision" && (revision === undefined || revision.length === 0)) {
		throw new Error("revision mode requires a revision.");
	}

	const label = sanitizeForFileName(options.label);

	const outerRepoRoot = await getRepoRoot(packageDir);
	const innerRepoRoot = resolve(analysisDir, "base-repo");

	let activeRepoRoot: string;
	let activePackageRoot: string;

	if (mode === "local") {
		activeRepoRoot = outerRepoRoot;
		activePackageRoot = packageDir;
		// Capture the staged diff up front, before any build steps. This way the
		// patch is preserved even if the build subsequently fails.
		await captureLocalPatch(outerRepoRoot, resolve(analysisDir, label));
	} else {
		const packageWorkspacePath = await getPackageWorkspacePath(packageDir);
		await ensureInnerRepoAtRevision(revision as string, outerRepoRoot, innerRepoRoot);
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

	console.log(`\n${"=".repeat(80)}`);
	console.log(`✓ Bundle collection complete (mode: ${mode}, label: ${label}).`);
	console.log(`  Stats directory: ${resolve(analysisDir, label)}`);
	console.log("=".repeat(80));
}
