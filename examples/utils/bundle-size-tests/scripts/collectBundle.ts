/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, Flags } from "@oclif/core";
import { simpleGit } from "simple-git";

import { maybePrintHelp } from "./oclifHelp.js";

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
async function getRepoRoot(cwd: string): Promise<string> {
	const output = await simpleGit(cwd).revparse(["--show-toplevel"]);
	return output.trim();
}

const outerRepoRoot = await getRepoRoot(outerPackageRoot);

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
 * @param label - Sanitized label for this build (e.g., "main", "client_v2.100.0").
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
 * Captures the outer repo's currently-staged diff to a sibling file next to
 * the bundle stats, so the analysis is reproducible even with uncommitted
 * changes. Only staged changes are recorded; unstaged changes are intentionally
 * excluded (they're often noisy / random) but a warning is printed if any are
 * detected so the user can `git add` the relevant pieces and re-run.
 *
 * The patch is written as `staged-changes.patch` next to `bundleStats.msp.gz`
 * inside the per-label directory.
 */
async function captureLocalPatch(repoRoot: string, labelDirectory: string): Promise<void> {
	const git = simpleGit(repoRoot);
	const stagedDiff = await git.diff(["--cached"]);
	const unstagedDiff = await git.diff();
	if (unstagedDiff.length > 0) {
		console.warn(
			`Warning: unstaged changes detected in ${repoRoot}. They will NOT be ` +
				`captured in the patch alongside this analysis. Stage all changes you ` +
				`want recorded (e.g. "git add -u") before running collectBundle so the ` +
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
async function getOuterOriginUrl(): Promise<string> {
	const { value } = await simpleGit(outerRepoRoot).getConfig("remote.origin.url");
	if (value === null || value.length === 0) {
		throw new Error(`Could not read remote.origin.url from ${outerRepoRoot}.`);
	}
	return value;
}

/**
 * Ensures the inner FluidFramework enlistment exists under {@link innerRepoRoot}
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
async function ensureInnerRepoAtRevision(revision: string): Promise<void> {
	if (!existsSync(resolve(innerRepoRoot, ".git"))) {
		const originUrl = await getOuterOriginUrl();
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
 * In revision mode, the inner repo at {@link innerRepoRoot} is cloned from the
 * outer repo's `origin` remote on first use and reused thereafter. The outer
 * repo's working tree, branch, and stash are never modified.
 */
class CollectBundleCommand extends Command {
	public static override readonly description =
		"Build and collect a bundle, either from the outer enlistment (local mode) or " +
		"from a separate inner enlistment checked out to a specific revision (revision mode). " +
		"The outer repo's working tree, branch, and stash are never modified.";

	public static override readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --mode revision --revision main",
		"<%= config.bin %> <%= command.id %> --mode revision --revision client_v2.100.0",
	];

	public static override readonly flags = {
		mode: Flags.string({
			description:
				"local: collect from the outer enlistment. revision: collect from a separate " +
				"inner enlistment checked out at --revision.",
			options: ["local", "revision"] as const,
			default: "local",
		}),
		revision: Flags.string({
			description:
				"(revision mode only, required) Branch, tag, or commit SHA to check out " +
				"in the inner repo before building. Also used as the default label.",
		}),
		label: Flags.string({
			description:
				"Override the directory name under which bundle stats are saved. " +
				'Defaults to the sanitized revision in revision mode, or "current" in local mode.',
		}),
		"force-clean-build": Flags.boolean({
			description:
				"Run the full workspace clean ('npm run clean' at the repo root) before " +
				"building. Off by default; opt in when stale incremental build state from a " +
				"previous revision may interfere with the current one.",
			default: false,
		}),
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(CollectBundleCommand);

		const mode = flags.mode as "local" | "revision";
		const { revision } = flags;
		const forceCleanBuild = flags["force-clean-build"];

		if (mode === "revision" && (revision === undefined || revision.length === 0)) {
			this.error("--mode revision requires --revision <rev>.", { exit: 1 });
		}

		const label = sanitizeForFileName(
			flags.label ?? (mode === "revision" ? (revision as string) : "current"),
		);

		let activeRepoRoot: string;
		let activePackageRoot: string;

		if (mode === "local") {
			activeRepoRoot = outerRepoRoot;
			activePackageRoot = outerPackageRoot;
			// Capture the staged diff up front, before any build steps. This way the
			// patch is preserved even if the build subsequently fails.
			await captureLocalPatch(outerRepoRoot, resolve(bundleAnalysisDirectory, label));
		} else {
			await ensureInnerRepoAtRevision(revision as string);
			activeRepoRoot = innerRepoRoot;
			activePackageRoot = resolve(innerRepoRoot, packageWorkspacePath);
			if (!existsSync(activePackageRoot)) {
				this.error(
					`Expected package not found in inner repo at ${activePackageRoot}. ` +
						`The revision "${revision as string}" may predate this package.`,
					{ exit: 1 },
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
}

if (!maybePrintHelp(process.argv.slice(2), "collectBundle.ts", CollectBundleCommand)) {
	await CollectBundleCommand.run(process.argv.slice(2), import.meta.url);
}
