/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outerPackageRoot = resolve(scriptDirectory, "..");

/**
 * Workspace-relative path of this package, used to locate the same package
 * inside a freshly-cloned inner repo.
 */
const packageWorkspacePath = "examples/utils/bundle-size-tests";

/**
 * Gets the repository root directory for the given working directory.
 */
function getRepoRoot(cwd: string): string {
	return execSync("git rev-parse --show-toplevel", {
		cwd,
		encoding: "utf-8",
	}).trim();
}

const outerRepoRoot = getRepoRoot(outerPackageRoot);

/**
 * Where saved bundle stats live, keyed by sanitized label.
 * `compareBundles.ts` reads from `<bundleAnalysisDirectory>/<label>/bundleStats.msp.gz`.
 *
 * Lives under this package's `bundleAnalysis/` directory, which is matched by
 * the repo-wide `.gitignore` entry for `bundleAnalysis`.
 *
 * Note: `npm run clean` in this package rimrafs `bundleAnalysis/`, so any state
 * here (including the inner repo clone) is wiped on clean. The inner repo is
 * re-cloned automatically on next use.
 */
const bundleAnalysisDirectory = resolve(outerPackageRoot, "bundleAnalysis");

/**
 * Persistent location of the inner FluidFramework enlistment used for
 * collecting bundles at arbitrary revisions. Cloned from the outer repo's
 * `origin` remote on first use and reused across runs.
 *
 * Only one inner repo is ever maintained — the unique name avoids collisions
 * with label subdirectories under {@link bundleAnalysisDirectory}.
 */
const innerRepoRoot = resolve(bundleAnalysisDirectory, "base-repo");

/**
 * Sanitizes a string for use as a filename.
 */
function sanitizeForFileName(value: string): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all -- Keep regex replacement for older TS lib targets.
	return value.replace(/[^\w.-]/g, "_");
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
 * Moves webpack's stats output and `build/` directory into the per-label directory
 * under the persistent analysis root.
 *
 * @param label - Sanitized label for this build (e.g., "main", "feature_branch").
 * @param sourcePackageRoot - Package root that produced the webpack output.
 */
function saveStats(label: string, sourcePackageRoot: string): void {
	const webpackStatsOutputPath = resolve(
		sourcePackageRoot,
		"bundleAnalysis",
		"bundleStats.msp.gz",
	);
	const webpackBuildOutputPath = resolve(sourcePackageRoot, "build");

	const labelDirectory = resolve(bundleAnalysisDirectory, label);
	const destStatsPath = resolve(labelDirectory, "bundleStats.msp.gz");

	if (!existsSync(webpackStatsOutputPath)) {
		throw new Error(
			`Bundle stats not found at ${webpackStatsOutputPath}. ` +
				`Check that webpack ran successfully.`,
		);
	}

	mkdirSync(labelDirectory, { recursive: true });
	// Use copy + unlink instead of renameSync because the source and destination
	// may live on different drives (e.g. D: -> C:\Users\<user>\AppData\Local\Temp),
	// which causes renameSync to fail with EXDEV on Windows.
	copyFileSync(webpackStatsOutputPath, destStatsPath);
	unlinkSync(webpackStatsOutputPath);
	console.log(`Saved stats to: ${destStatsPath}`);

	if (existsSync(webpackBuildOutputPath)) {
		const destBuildPath = resolve(labelDirectory, "build");
		rmSync(destBuildPath, { recursive: true, force: true });
		cpSync(webpackBuildOutputPath, destBuildPath, { recursive: true });
		console.log(`Saved build outputs to: ${destBuildPath}`);
	} else {
		console.warn(
			`Warning: webpack build outputs not found at ${webpackBuildOutputPath}; ` +
				`gzip sizes will be unavailable for label "${label}".`,
		);
	}
}

/**
 * Returns the URL of the outer repo's `origin` remote, used as the source
 * for cloning the inner repo.
 */
function getOuterOriginUrl(): string {
	return execSync("git config --get remote.origin.url", {
		cwd: outerRepoRoot,
		encoding: "utf-8",
	}).trim();
}

/**
 * Ensures the inner FluidFramework enlistment exists under {@link innerRepoRoot}.
 *
 * On first call, clones from the outer repo's `origin` remote. On subsequent
 * calls, reuses the existing clone (an explicit `git fetch` is performed before
 * checkout to ensure the requested revision is available).
 *
 * Never modifies the outer repo's working tree, branch, or stash.
 */
function ensureInnerRepo(): void {
	if (existsSync(resolve(innerRepoRoot, ".git"))) {
		return;
	}

	const originUrl = getOuterOriginUrl();
	mkdirSync(dirname(innerRepoRoot), { recursive: true });
	console.log(`\nCloning inner repo from ${originUrl} into ${innerRepoRoot}...`);
	// Filter blobs to keep the clone fast; blobs are fetched lazily on checkout.
	run(
		`git clone --filter=blob:none ${JSON.stringify(originUrl)} ${JSON.stringify(innerRepoRoot)}`,
		dirname(innerRepoRoot),
	);
}

/**
 * Fetches the latest refs and checks out the requested revision in the inner repo.
 * The revision can be a branch, tag, or commit SHA.
 */
function syncInnerRepoToRevision(revision: string): void {
	console.log(`\nFetching latest refs in inner repo...`);
	run("git fetch --tags origin", innerRepoRoot);

	console.log(`Checking out revision "${revision}" in inner repo...`);
	// Use detached HEAD checkout so we don't have to manage local branch state.
	run(`git checkout --detach ${JSON.stringify(revision)}`, innerRepoRoot);
}

/**
 * Extracts the value of a command-line option from the argument list.
 */
function getOptionValue(argv: string[], optionName: string): string | undefined {
	const optionPrefix = `${optionName}=`;
	const index = argv.findIndex((arg) => arg === optionName || arg.startsWith(optionPrefix));
	if (index === -1) {
		return undefined;
	}

	const optionArg = argv[index];
	if (optionArg === undefined) {
		return undefined;
	}

	if (optionArg.startsWith(optionPrefix)) {
		return optionArg.slice(optionPrefix.length);
	}

	return argv[index + 1];
}

/**
 * Checks if a flag is present in the command-line argument list.
 */
function hasFlag(argv: string[], flagName: string): boolean {
	return argv.includes(flagName);
}

/**
 * Prints the help text describing usage and options.
 */
function printHelp(): void {
	console.log(`
Usage:
  jiti ./scripts/collectBundle.ts [options]

Modes:
  --mode local              (default) Build and collect a bundle from the outer
                            FluidFramework enlistment (the repo containing this
                            script). The outer repo's working tree, branch, and
                            stash are never modified.

  --mode revision           Build and collect a bundle from a separate inner
                            FluidFramework enlistment, checked out to a specific
                            revision. The inner repo lives at:
                              ${innerRepoRoot}
                            It is cloned from the outer repo's 'origin' remote on
                            first use and reused thereafter.

Options:
  --help, -h                Show this help text and exit.
  --revision <rev>          (revision mode only, required) Branch, tag, or commit
                            SHA to check out in the inner repo before building.
                            Also used as the label under which the bundle stats
                            are saved.
  --force-clean-build       Run the full workspace clean ('npm run clean' at the
                            repo root) before building. Off by default; opt in
                            when stale incremental build state from a previous
                            revision may interfere with the current one (e.g.
                            after switching revisions in the inner repo).

Bundle stats are saved under:
  ${bundleAnalysisDirectory}/<sanitized-label>/
where <label> is the revision name in revision mode, or "current" in local mode.

Examples:
  jiti ./scripts/collectBundle.ts
  jiti ./scripts/collectBundle.ts --mode revision --revision main
  jiti ./scripts/collectBundle.ts --mode revision --revision v2.20.0
`);
}

/**
 * Main entry point: collects a single bundle in either local or revision mode.
 *
 * @param argv - The command-line argument list
 */
function main(argv: string[]): void {
	if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
		printHelp();
		return;
	}

	const mode = getOptionValue(argv, "--mode") ?? "local";
	if (mode !== "local" && mode !== "revision") {
		throw new Error(`Invalid --mode "${mode}". Expected "local" or "revision".`);
	}

	const revision = getOptionValue(argv, "--revision");
	const forceCleanBuild = hasFlag(argv, "--force-clean-build");

	if (mode === "revision" && (revision === undefined || revision.length === 0)) {
		throw new Error(`--mode revision requires --revision <rev>.`);
	}

	const label = sanitizeForFileName(mode === "revision" ? (revision as string) : "current");

	let activeRepoRoot: string;
	let activePackageRoot: string;

	if (mode === "local") {
		activeRepoRoot = outerRepoRoot;
		activePackageRoot = outerPackageRoot;
	} else {
		ensureInnerRepo();
		// Only the inner repo's revision is changed. The outer repo is never touched.
		syncInnerRepoToRevision(revision as string);
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
	saveStats(label, activePackageRoot);

	console.log(`\n${"=".repeat(80)}`);
	console.log(`✓ Bundle collection complete (mode: ${mode}, label: ${label}).`);
	console.log(`  Stats directory: ${resolve(bundleAnalysisDirectory, label)}`);
	console.log("=".repeat(80));
}

main(process.argv.slice(2));
