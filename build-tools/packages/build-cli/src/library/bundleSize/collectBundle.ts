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

import { findGitRootSync, type PackageJson } from "@fluid-tools/build-infrastructure";
import { simpleGit } from "simple-git";

import { pickFreshestRemote } from "../git/pickFreshestRemote.js";

/** Filename of the per-label analyzer report. */
const analyzerFileName = "analyzer.json";

/** Filename of the sidecar recording the SHA a revision-mode report was built from. */
const revisionMarkerFileName = "revision.txt";

/**
 * Options for {@link collectBundle}.
 */
export interface CollectBundleOptions {
	/**
	 * `local`: collect from the outer enlistment that contains {@link CollectBundleOptions.packageDir}.
	 * `revision`: collect from a separate inner enlistment checked out at the commit resolved from
	 * {@link CollectBundleOptions.revision} or {@link CollectBundleOptions.mergeBaseOf}.
	 *
	 * In `local` mode the outer enlistment is built exactly as it sits on disk: its git state
	 * (working tree, branch, and revision) is never modified. All checkout/fetch happens only in
	 * the inner repo used by `revision` mode.
	 */
	readonly mode: "local" | "revision";
	/**
	 * (revision mode only) Committish (branch, tag, commit SHA, or any committish like `HEAD~2`)
	 * to build as-is, resolved via `git rev-parse`. Mutually exclusive with
	 * {@link CollectBundleOptions.mergeBaseOf}. Resolved against the outer repo. Also used as the
	 * default label.
	 */
	readonly revision?: string;
	/**
	 * (revision mode only) Committish whose merge-base with HEAD (the fork point) is built instead
	 * of the committish itself. Mutually exclusive with {@link CollectBundleOptions.revision}.
	 * Resolved against the outer repo. Also used as the default label.
	 *
	 * When neither this nor {@link CollectBundleOptions.revision} is set in revision mode, the base
	 * defaults to the freshest canonical "main" (see {@link resolveDefaultBaseCommittish}) at its
	 * merge-base with HEAD.
	 */
	readonly mergeBaseOf?: string;
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
	 * Package root whose `build:compile` is run to compile the package and its dependencies.
	 */
	readonly packageDir: string;
	/**
	 * Directory whose `webpack` build is run and whose `analyzer.json` is collected. Defaults to
	 * {@link CollectBundleOptions.packageDir} when not specified, so a single directory can serve as
	 * both the compiled package and the webpack root. Set this when the webpack config lives in a
	 * different directory than the package being compiled (e.g. a scenario subdirectory that shares
	 * its parent package's compiled output).
	 */
	readonly webpackDir?: string;
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

// --- Utilities ---

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

// --- Git revision resolution ---

/**
 * Resolves `rev` to its full commit SHA via `git rev-parse <rev>^{commit}`, or
 * throws if it cannot be resolved locally. See
 * {@link https://git-scm.com/docs/git-rev-parse}.
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
 * Resolves the merge-base of `rev` and `otherRev` (default `HEAD`) to a commit SHA via
 * `git merge-base`, or throws if none can be found locally. See
 * {@link https://git-scm.com/docs/git-merge-base}.
 */
async function resolveMergeBase(
	repoRoot: string,
	rev: string,
	otherRev = "HEAD",
): Promise<string> {
	try {
		const output = await simpleGit(repoRoot).raw(["merge-base", rev, otherRev]);
		const sha = output.trim();
		if (sha.length > 0) return sha;
	} catch {
		// Fall through to the shared error below.
	}
	throw new Error(
		`Could not find merge-base of "${rev}" and "${otherRev}". ` +
			`Ensure the revision exists locally (e.g. "git fetch origin ${rev}").`,
	);
}

/**
 * Resolves a committish to a concrete SHA in `outerRepoRoot` — the committish as-is, or (when
 * `useMergeBase`) its merge-base with HEAD (the fork point).
 */
async function resolveBuildRevision(
	outerRepoRoot: string,
	committish: string,
	useMergeBase: boolean,
): Promise<string> {
	const resolved = useMergeBase
		? await resolveMergeBase(outerRepoRoot, committish)
		: await resolveSha(outerRepoRoot, committish);
	if (resolved !== committish) {
		console.log(
			`Resolved revision "${committish}" to ${useMergeBase ? "merge-base " : ""}${resolved}.`,
		);
	}
	return resolved;
}

/** Matches a remote URL that points at the canonical microsoft/FluidFramework repo. */
const canonicalFluidRemoteUrl = /(^|[/:])microsoft\/fluidframework(\.git)?$/i;

/**
 * Resolves the default base committish used when revision mode is requested without an explicit
 * `revision`/`mergeBaseOf`: the `main` branch of the freshest remote pointing at
 * microsoft/FluidFramework (preferred over the local `main`, which may be stale or absent in
 * worktree setups). Falls back to the local `main` with a warning when no such remote is
 * configured or fetched.
 */
function resolveDefaultBaseCommittish(): string {
	const remote = pickFreshestRemote("main", (url) => canonicalFluidRemoteUrl.test(url));
	if (remote === undefined) {
		console.warn(
			'Could not auto-detect a remote pointing at microsoft/FluidFramework; using local "main" ' +
				"as the base, which may be stale.",
		);
		return "main";
	}
	const ref = `${remote}/main`;
	console.log(`Auto-detected base revision "${ref}" (freshest "main").`);
	return ref;
}

// --- Build steps ---

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
 * Throws a user-facing error unless the package at `packageRoot` declares `webpack` as a
 * devDependency. The scenario bundle is built with `pnpm exec webpack` from this package, so webpack
 * must be one of its devDependencies.
 */
function ensureWebpackInstalled(packageRoot: string): void {
	const packageJsonPath = resolve(packageRoot, "package.json");
	const { name, devDependencies } = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as PackageJson;
	if (devDependencies?.webpack === undefined) {
		throw new Error(
			`webpack is required to build the bundle but is not a devDependency of ${name} (${packageRoot}). ` +
				`Add "webpack" (and "webpack-cli") to that package's devDependencies and run \`pnpm install\`.`,
		);
	}
}

/**
 * Compiles the package and its dependencies (in `packageRoot`), then builds the webpack bundles
 * (in `webpackRoot`). These are usually the same directory, but may differ when the webpack config
 * lives in a separate directory (e.g. a scenario) that reuses its parent package's compiled output.
 * Uses `build:compile` (not the full `build`) to skip the lint / docs / api-report tasks, which are
 * unnecessary here and prone to unrelated failures across revisions.
 */
function buildPackage(packageRoot: string, webpackRoot: string): void {
	console.log(`\nCompiling the package and its dependencies in ${packageRoot}...`);
	run("npm run build:compile", packageRoot);
	console.log(`\nBuilding bundles with webpack in ${webpackRoot}...`);
	ensureWebpackInstalled(packageRoot);
	if (resolve(webpackRoot) === resolve(packageRoot)) {
		// Same directory: run the package's own `webpack` script.
		run("npm run webpack", webpackRoot);
	} else {
		// The scenario dir has no package.json, so `pnpm exec` there falls back to a workspace-
		// recursive exec and fails. Run webpack from packageRoot instead and point it at the
		// scenario config with --config.
		const scenarioConfig = resolve(webpackRoot, "webpack.config.cjs");
		run(`pnpm exec webpack --config "${scenarioConfig}"`, packageRoot);
	}
}

// --- Environment prep ---

/**
 * Records the outer repo's staged diff as `staged-changes.patch` in the per-label
 * directory so the analysis is reproducible. The patch is never applied; unstaged
 * changes are excluded, with a warning if any are present.
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
 * Ensures the inner FluidFramework enlistment exists under `innerRepoRoot` and is
 * checked out (detached) at `sha`.
 *
 * @remarks
 * On first call, clones from the outer enlistment on disk (`--no-tags --no-checkout`),
 * so no network is involved and every commit in the outer repo — including merge-base
 * SHAs that aren't branch tips — is already available. Callers pass an already-resolved
 * SHA, so any committish is handled uniformly. Never touches the outer repo's git state.
 *
 * On a reused inner repo, the outer enlistment may have advanced since the clone (e.g. new
 * commits landed on a branch, or `sha` is a freshly-resolved merge-base) so the requested
 * commit might not yet exist inside the inner repo — `git checkout` would then fail with
 * "fatal: unable to read tree". To avoid re-cloning, re-fetch the outer repo's branch refs
 * first, which brings the inner repo's object database to parity with a fresh clone (every
 * commit reachable from an outer branch head, including merge-base SHAs that are ancestors
 * of those heads). The fetch reads only the outer enlistment on disk, so it stays offline.
 */
async function ensureInnerRepoAtRevision(
	sha: string,
	outerRepoRoot: string,
	innerRepoRoot: string,
): Promise<void> {
	if (existsSync(resolve(innerRepoRoot, ".git"))) {
		// Reusing an existing inner clone: refresh its branch refs from the outer repo so any
		// commit the outer repo now has (including a newly-resolved merge-base) is available
		// before checkout. `--no-tags` mirrors the clone; `--prune` drops branches the outer
		// repo has since deleted. `origin` is the outer enlistment path the clone was made from.
		console.log(`\nReusing inner repo; fetching latest refs from ${outerRepoRoot}...`);
		await simpleGit(innerRepoRoot).raw(["fetch", "origin", "--no-tags", "--prune"]);
	} else {
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
 * Prepares a revision-mode build: checks out the inner repo at `sha`, installs deps, and returns
 * the inner repo + package roots. Throws if the package doesn't exist at that revision.
 */
async function prepareRevisionBuild(
	sha: string,
	outerRepoRoot: string,
	packageDir: string,
	webpackDir: string,
	innerRepoRoot: string,
): Promise<{ repoRoot: string; packageRoot: string; webpackRoot: string }> {
	await ensureInnerRepoAtRevision(sha, outerRepoRoot, innerRepoRoot);
	// Same package/webpack directories inside the inner repo, via their paths relative to the repo root.
	const packageRoot = resolve(innerRepoRoot, relative(outerRepoRoot, packageDir));
	if (!existsSync(packageRoot)) {
		throw new Error(
			`Expected package not found in inner repo at ${packageRoot}. ` +
				`The revision "${sha}" may predate this package.`,
		);
	}
	const webpackRoot = resolve(innerRepoRoot, relative(outerRepoRoot, webpackDir));
	if (!existsSync(webpackRoot)) {
		throw new Error(
			`Expected webpack directory not found in inner repo at ${webpackRoot}. ` +
				`The revision "${sha}" may predate it.`,
		);
	}
	installDependencies(innerRepoRoot);
	return { repoRoot: innerRepoRoot, packageRoot, webpackRoot };
}

// --- Output ---

/**
 * Saves webpack-bundle-analyzer's `analyzer.json` report into the per-label directory under
 * the persistent analysis root. This report is sufficient for the comparison, so the (large)
 * webpack stats and `build/` outputs do not need to be retained.
 *
 * @remarks
 * Uses copy + unlink instead of `renameSync` because the source and destination
 * may live on different drives (e.g. `D:` to `C:\Users\<user>\AppData\Local\Temp`),
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
		analyzerFileName,
	);

	const labelDirectory = resolve(analysisDir, label);
	const destAnalyzerPath = resolve(labelDirectory, analyzerFileName);

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
 * Logs the standard "collection complete" banner.
 */
function logCollectionComplete(mode: string, label: string, labelDirectory: string): void {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`✓ Bundle collection complete (mode: ${mode}, label: ${label}).`);
	console.log(`  Stats directory: ${labelDirectory}`);
	console.log("=".repeat(80));
}

// --- Orchestrator ---

/**
 * Collects a single bundle from either the outer enlistment (local mode) or a
 * separate inner enlistment checked out to a specific revision (revision mode),
 * and returns the (sanitized) label its stats were saved under.
 *
 * @remarks
 * In revision mode, {@link CollectBundleOptions.revision} is built as-is and
 * {@link CollectBundleOptions.mergeBaseOf} at its merge-base with HEAD (the fork point); when
 * neither is given, the base defaults to the freshest canonical "main" at its merge-base with
 * HEAD (see {@link resolveDefaultBaseCommittish}). The resolved SHA is recorded in a sidecar
 * `revision.txt`, letting a later run with the same SHA reuse the cached report (unless
 * {@link CollectBundleOptions.forceCleanBuild} is set). Builds happen in the inner repo (see
 * {@link ensureInnerRepoAtRevision}).
 *
 * In local mode the working tree is built exactly as it sits on disk; the only side effect is the
 * up-front staged-patch record (see {@link captureLocalPatch}). The outer repo's git state is
 * never modified.
 */
export async function collectBundle(options: CollectBundleOptions): Promise<string> {
	const { mode, revision, mergeBaseOf, forceCleanBuild, packageDir, analysisDir } = options;
	const webpackDir = options.webpackDir ?? packageDir;

	const outerRepoRoot = findGitRootSync(packageDir);
	const innerRepoRoot = options.baseRepoDir ?? resolve(analysisDir, "base-repo");

	// In revision mode, decide what to build, how to resolve it, and resolve it to a SHA:
	//   - revision    → build that committish as-is (rev-parse).
	//   - mergeBaseOf → build its merge-base with HEAD (the fork point).
	//   - neither     → default to the freshest canonical "main" at its merge-base with HEAD. This
	//     is the orchestrator's pass-through of an omitted base: the local "main" may be stale, so
	//     "<remote>/main" is auto-detected, and an unspecified base means "where this branch forked
	//     from upstream main".
	let committish: string | undefined;
	let resolvedRevision: string | undefined;
	if (mode === "revision") {
		let useMergeBase: boolean;
		if (revision !== undefined) {
			committish = revision;
			useMergeBase = false;
		} else if (mergeBaseOf !== undefined) {
			committish = mergeBaseOf;
			useMergeBase = true;
		} else {
			committish = resolveDefaultBaseCommittish();
			useMergeBase = true;
		}
		resolvedRevision = await resolveBuildRevision(outerRepoRoot, committish, useMergeBase);
	}

	const label = sanitizeForFileName(
		options.label ?? committish ?? `current_${Math.floor(Date.now() / 1000)}`,
	);
	const labelDirectory = resolve(analysisDir, label);

	// Reuse the cached report when the resolved SHA matches a previous revision-mode run.
	if (resolvedRevision !== undefined && !forceCleanBuild) {
		const analyzerPath = resolve(labelDirectory, analyzerFileName);
		const markerPath = resolve(labelDirectory, revisionMarkerFileName);
		const cachedRevision = existsSync(markerPath)
			? readFileSync(markerPath, "utf8").trim()
			: undefined;
		if (existsSync(analyzerPath) && cachedRevision === resolvedRevision) {
			console.log(`Reusing cached bundle (revision: ${resolvedRevision}, label: ${label}).`);
			console.log(`  Report: ${analyzerPath}`);
			logCollectionComplete(mode, label, labelDirectory);
			return label;
		}
	}

	// Prepare the build environment: the local working tree, or the inner repo at the revision.
	let repoRoot = outerRepoRoot;
	let packageRoot = packageDir;
	let webpackRoot = webpackDir;
	if (mode === "local") {
		await captureLocalPatch(outerRepoRoot, labelDirectory);
	} else {
		({ repoRoot, packageRoot, webpackRoot } = await prepareRevisionBuild(
			resolvedRevision as string,
			outerRepoRoot,
			packageDir,
			webpackDir,
			innerRepoRoot,
		));
	}

	// Clean (if needed) and build the bundles.
	if (forceCleanBuild) {
		cleanWorkspace(repoRoot);
	}
	buildPackage(packageRoot, webpackRoot);

	// Save stats, recording the SHA so a later run against the same revision can skip the rebuild.
	saveStats(label, webpackRoot, analysisDir);
	if (resolvedRevision !== undefined) {
		writeFileSync(resolve(labelDirectory, revisionMarkerFileName), `${resolvedRevision}\n`);
	}

	logCollectionComplete(mode, label, labelDirectory);
	return label;
}
