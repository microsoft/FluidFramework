/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { collectBundle } from "./collectBundle.js";
import { compareBundles } from "./compareBundles.js";

/**
 * Options for {@link collectAndCompareBundles}.
 */
export interface CollectAndCompareBundlesOptions {
	/**
	 * Revision to use as the comparison baseline (branch, tag, or commit SHA). By default the
	 * actual base used is the merge-base of HEAD and this revision (the fork point). When
	 * {@link CollectAndCompareBundlesOptions.exactBase} is set, this revision is used as-is
	 * (no merge-base).
	 */
	readonly baseRevision: string;
	/**
	 * Use {@link CollectAndCompareBundlesOptions.baseRevision} as-is (resolved via `rev-parse`)
	 * instead of taking the merge-base with HEAD. Useful for comparing the working tree against an
	 * exact commit (e.g. "current vs. its parent") rather than the fork point.
	 */
	readonly exactBase?: boolean;
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
 * Orchestrates: {@link collectBundle} (local working tree), then
 * {@link collectBundle} (base revision), then {@link compareBundles}.
 *
 * The base revision is taken as the merge-base of HEAD and `baseRevision` by
 * default, or used as-is when `exactBase` is set; that resolution, and caching
 * of the base report, are handled inside {@link collectBundle}.
 *
 * Labels (used as analysis subdirectory names) are determined automatically: the
 * local bundle is saved under a timestamped "current_<epoch>" label (generated
 * by {@link collectBundle} and returned for the comparison) and the base bundle
 * under "main", so that {@link compareBundles} can find both directories.
 *
 * The outer repo's working tree, branch, and stash are never modified.
 *
 * @remarks
 * The base label is pinned to "main" because {@link compareBundles} reads from a
 * fixed base label. The current label is timestamped by {@link collectBundle}
 * (so successive runs carrying different uncommitted changes don't clobber each
 * other) and the returned value is passed straight to {@link compareBundles} so
 * they agree on the directory.
 *
 * The inner enlistment used to build the base bundle is a scratch clone, not
 * report data, so it lives under the output directory rather than alongside the
 * per-label analyzer reports in `analysisDir`. Once the comparison is complete
 * the inner repo is deleted by default (it re-creates cheaply via clone, and
 * keeping it consumes hundreds of MB once dependencies are installed); pass
 * {@link CollectAndCompareBundlesOptions.keepBaseRepo} to retain it.
 */
export async function collectAndCompareBundles(
	options: CollectAndCompareBundlesOptions,
): Promise<void> {
	const {
		baseRevision,
		exactBase = false,
		forceCleanBuild,
		keepBaseRepo,
		packageDir,
		analysisDir,
		outputDir,
	} = options;

	const innerRepoRoot = resolve(outputDir, "base-repo");
	const baseLabel = "main";

	try {
		console.log(`\n${"=".repeat(80)}`);
		console.log("Collecting local bundle...");
		console.log("=".repeat(80));
		const currentLabel = await collectBundle({
			mode: "local",
			forceCleanBuild,
			packageDir,
			analysisDir,
		});

		console.log(`\n${"=".repeat(80)}`);
		console.log(`Collecting base bundle (revision: ${baseRevision}, label: ${baseLabel})...`);
		console.log("=".repeat(80));
		await collectBundle({
			mode: "revision",
			revision: baseRevision,
			resolution: exactBase ? "exact" : "merge-base",
			label: baseLabel,
			forceCleanBuild,
			packageDir,
			analysisDir,
			baseRepoDir: innerRepoRoot,
		});

		console.log(`\n${"=".repeat(80)}`);
		console.log("Running bundle comparison...");
		console.log("=".repeat(80));
		compareBundles({
			analysisDirectory: analysisDir,
			outputDirectory: outputDir,
			baseLabel,
			currentLabel,
		});

		// Delete the inner repo now that the comparison is complete (re-created
		// cheaply on the next run). Pass keepBaseRepo to retain it for debugging.
		if (!keepBaseRepo && existsSync(innerRepoRoot)) {
			console.log(`\nDeleting inner base-repo at ${innerRepoRoot}...`);
			rmSync(innerRepoRoot, { recursive: true, force: true });
		}

		console.log(`\n${"=".repeat(80)}`);
		console.log("✓ Bundle collection and comparison complete!");
		console.log("=".repeat(80));
	} catch (error) {
		console.error("\n✖ Error:", error instanceof Error ? error.message : String(error));
		throw error;
	}
}
