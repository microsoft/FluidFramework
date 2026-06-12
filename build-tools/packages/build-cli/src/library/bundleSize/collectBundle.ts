/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
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
 * Ensures the inner FluidFramework enlistment exists under `innerRepoRoot`
 * and is checked out at the requested revision.
 *
 * On first call, clones the inner repo directly from the outer enlistment on
 * disk (`--no-tags --no-checkout`). Because the source is a local repository,
 * no remote or network access is involved and every commit already present in
 * the outer repo (including merge-base SHAs that aren't branch tips) is
 * available without a separate fetch. On every call the requested revision is
 * checked out detached.
 *
 * Never modifies the outer repo's working tree, branch, or stash.
 */
async function ensureInnerRepoAtRevision(
	revision: string,
	outerRepoRoot: string,
	innerRepoRoot: string,
): Promise<void> {
	if (!existsSync(resolve(innerRepoRoot, ".git"))) {
		mkdirSync(dirname(innerRepoRoot), { recursive: true });
		console.log(`\nCloning inner repo from ${outerRepoRoot} into ${innerRepoRoot}...`);
		// Clone from the outer enlistment on disk: this avoids any remote/network
		// access and gives the inner repo every object the outer repo already has,
		// so the requested revision can be checked out below without a fetch.
		// --no-checkout because we check out the exact revision explicitly below.
		await simpleGit(dirname(innerRepoRoot)).clone(outerRepoRoot, innerRepoRoot, [
			"--no-tags",
			"--no-checkout",
		]);
	}

	const innerGit = simpleGit(innerRepoRoot);
	console.log(`Checking out revision "${revision}" in inner repo...`);
	// Use detached HEAD checkout so we don't have to manage local branch state.
	// The revision is resolved against the objects copied from the outer repo
	// during the clone above.
	await innerGit.raw(["checkout", "--detach", revision]);
}

/**
 * Collects a single bundle from either the outer enlistment (local mode) or a
 * separate inner enlistment checked out to a specific revision (revision mode).
 *
 * In revision mode, the inner repo (at {@link CollectBundleOptions.baseRepoDir}, defaulting to
 * `<analysisDir>/base-repo`) is cloned from the outer enlistment on disk on first use and
 * reused thereafter. No remote or network access is involved. The outer repo's working tree,
 * branch, and stash are never modified.
 */
export async function collectBundle(options: CollectBundleOptions): Promise<void> {
	const { mode, revision, forceCleanBuild, packageDir, analysisDir } = options;

	if (mode === "revision" && (revision === undefined || revision.length === 0)) {
		throw new Error("revision mode requires a revision.");
	}

	const label = sanitizeForFileName(options.label);

	const outerRepoRoot = findGitRootSync(packageDir);
	const innerRepoRoot = options.baseRepoDir ?? resolve(analysisDir, "base-repo");

	let activeRepoRoot: string;
	let activePackageRoot: string;

	if (mode === "local") {
		activeRepoRoot = outerRepoRoot;
		activePackageRoot = packageDir;
		// Local mode builds the outer enlistment exactly as it sits on disk: we
		// never check out, stash, or otherwise mutate its working tree or revision.
		// The captured patch is therefore only a reproducibility record of what was
		// staged at collection time — it is never applied. Capture it up front,
		// before any build steps, so the patch is preserved even if the build
		// subsequently fails.
		await captureLocalPatch(outerRepoRoot, resolve(analysisDir, label));
	} else {
		// Path of the package relative to the repo root, e.g.
		// `examples/utils/bundle-size-tests`. Used to locate the same package
		// inside the freshly-cloned inner repo.
		const packageWorkspacePath = relative(outerRepoRoot, packageDir);
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
