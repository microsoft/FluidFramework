/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { simpleGit } from "simple-git";

import { collectBundle } from "./collectBundle.js";
import { compareBundles } from "./compareBundles.js";

/**
 * Options for {@link collectAndCompareBundles}.
 */
export interface CollectAndCompareBundlesOptions {
	/**
	 * Revision to use as the comparison baseline (branch, tag, or commit SHA). The actual base
	 * used is the merge-base of HEAD and this revision (the fork point).
	 */
	readonly baseRevision: string;
	/** Collect both bundles, but skip the comparison step. */
	readonly skipCompare: boolean;
	/** Run the full workspace clean before each build. */
	readonly forceCleanBuild: boolean;
	/** For debugging only: keep the inner base-repo clone after collecting the base bundle. */
	readonly keepBaseRepo: boolean;
	/** Package root whose webpack bundles are built and compared. */
	readonly packageDir: string;
	/** Directory under which per-label analyzer stats are saved. */
	readonly analysisDir: string;
	/** Directory where the comparison reports are written. */
	readonly outputDir: string;
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
	packageDir: string,
	rev: string,
	otherRev = "HEAD",
): Promise<string | undefined> {
	try {
		const output = await simpleGit(packageDir).raw(["merge-base", rev, otherRev]);
		const sha = output.trim();
		return sha.length > 0 ? sha : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Orchestrates: {@link collectBundle} (local), then {@link collectBundle} (revision merge-base),
 * then {@link compareBundles}.
 *
 * Labels (used as analysis subdirectory names) are determined automatically:
 * the local bundle is saved under a timestamped "current_<epoch>" label and the
 * base bundle under "main", regardless of the resolved revision SHA, so that
 * {@link compareBundles} can find both directories.
 *
 * The outer repo's working tree, branch, and stash are never modified.
 */
export async function collectAndCompareBundles(
	options: CollectAndCompareBundlesOptions,
): Promise<void> {
	const {
		baseRevision: baseRevisionInput,
		skipCompare,
		forceCleanBuild,
		keepBaseRepo,
		packageDir,
		analysisDir,
		outputDir,
	} = options;

	const resolvedBaseRevision = await resolveMergeBase(packageDir, baseRevisionInput);
	if (resolvedBaseRevision === undefined) {
		throw new Error(
			`Could not find merge-base of HEAD and "${baseRevisionInput}". ` +
				`Ensure the revision exists locally (e.g. "git fetch origin ${baseRevisionInput}").`,
		);
	}
	if (resolvedBaseRevision !== baseRevisionInput) {
		console.log(
			`Resolved base revision "${baseRevisionInput}" to merge-base ${resolvedBaseRevision}.`,
		);
	}
	const baseRevision = resolvedBaseRevision;
	// compareBundles reads from a fixed base label ("main"); pin the base
	// bundle's directory name to that regardless of which revision we resolved.
	const baseLabel = "main";
	// The current side is timestamped (unix epoch seconds) so successive runs,
	// which may carry different uncommitted changes, don't clobber each other.
	// We pass the same label to collectBundle and compareBundles so they agree
	// on the directory.
	const currentLabel = `current_${Math.floor(Date.now() / 1000)}`;

	// The inner repo is only ever checked out at a clean revision; its build
	// output for a given SHA is deterministic, so a cached base report from a
	// prior run for the same SHA can be reused. We track the SHA used to produce
	// the base report in a sidecar revision.txt file.
	const baseLabelDirectory = resolve(analysisDir, baseLabel);
	const baseAnalyzerPath = resolve(baseLabelDirectory, "analyzer.json");
	const baseRevisionMarkerPath = resolve(baseLabelDirectory, "revision.txt");
	const cachedBaseRevision = existsSync(baseRevisionMarkerPath)
		? readFileSync(baseRevisionMarkerPath, "utf8").trim()
		: undefined;
	const baseStatsAreCached =
		!forceCleanBuild && existsSync(baseAnalyzerPath) && cachedBaseRevision === baseRevision;

	try {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`Collecting local bundle (label: ${currentLabel})...`);
		console.log("=".repeat(80));
		await collectBundle({
			mode: "local",
			label: currentLabel,
			forceCleanBuild,
			packageDir,
			analysisDir,
		});

		console.log(`\n${"=".repeat(80)}`);
		if (baseStatsAreCached) {
			console.log(
				`Reusing cached base bundle (revision: ${baseRevision}, label: ${baseLabel}).`,
			);
			console.log(`  Report: ${baseAnalyzerPath}`);
			console.log("=".repeat(80));
		} else {
			console.log(
				`Collecting base bundle (revision: ${baseRevision}, label: ${baseLabel})...`,
			);
			console.log("=".repeat(80));
			await collectBundle({
				mode: "revision",
				revision: baseRevision,
				label: baseLabel,
				forceCleanBuild,
				packageDir,
				analysisDir,
			});
			// Record the SHA that produced this report so a subsequent run
			// against the same merge-base can skip the rebuild.
			mkdirSync(baseLabelDirectory, { recursive: true });
			writeFileSync(baseRevisionMarkerPath, `${baseRevision}\n`);

			// Delete the inner repo now that the report is saved. It's a
			// shallow clone of the outer repo's `origin`, so re-creating it
			// on the next run is cheap; keeping it around just consumes disk
			// (hundreds of MB once dependencies are installed).
			if (!keepBaseRepo) {
				const innerRepoRoot = resolve(analysisDir, "base-repo");
				if (existsSync(innerRepoRoot)) {
					console.log(`Deleting inner base-repo at ${innerRepoRoot}...`);
					rmSync(innerRepoRoot, { recursive: true, force: true });
				}
			}
		}

		if (!skipCompare) {
			console.log(`\n${"=".repeat(80)}`);
			console.log("Running bundle comparison...");
			console.log("=".repeat(80));
			compareBundles({
				analysisDirectory: analysisDir,
				outputDirectory: outputDir,
				baseLabel,
				currentLabel,
			});
		}

		console.log(`\n${"=".repeat(80)}`);
		console.log("✓ Bundle collection and comparison complete!");
		console.log("=".repeat(80));
	} catch (error) {
		console.error("\n✖ Error:", error instanceof Error ? error.message : String(error));
		throw error;
	}
}
