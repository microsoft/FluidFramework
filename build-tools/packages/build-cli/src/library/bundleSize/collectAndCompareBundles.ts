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
	 * (no merge-base). When omitted, {@link collectBundle} auto-detects the freshest "main" of a
	 * remote pointing at microsoft/FluidFramework and uses its merge-base with HEAD.
	 */
	readonly baseRevision?: string;
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
	/** Package root whose `build:compile` is run to compile the package and its dependencies. */
	readonly packageDir: string;
	/**
	 * Directory whose `webpack` build is run and whose `analyzer.json` is collected. Defaults to
	 * {@link CollectAndCompareBundlesOptions.packageDir}. Set this when the webpack config lives in a
	 * different directory than the package being compiled (e.g. a scenario subdirectory).
	 */
	readonly webpackDir?: string;
	/** Directory under which per-label analyzer stats are saved. */
	readonly analysisDir: string;
	/** Directory where the comparison reports are written. */
	readonly outputDir: string;
}

/**
 * Orchestrates {@link collectBundle} (local working tree) and {@link collectBundle} (base
 * revision), then {@link compareBundles}. The base is the merge-base of HEAD and `baseRevision`,
 * or the revision as-is when `exactBase` is set; when `baseRevision` is omitted, the base defaults
 * to the freshest canonical "main" at its merge-base with HEAD. Labels are automatic: the local
 * bundle under a timestamped `current_<epoch>` label and the base under `main`. The scratch inner
 * repo used to build the base is deleted afterward unless
 * {@link CollectAndCompareBundlesOptions.keepBaseRepo} is set; the outer repo is never modified.
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
		webpackDir,
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
			webpackDir,
			analysisDir,
		});

		console.log(`\n${"=".repeat(80)}`);
		console.log(
			`Collecting base bundle (revision: ${baseRevision ?? "auto-detect freshest main"}, label: ${baseLabel})...`,
		);
		console.log("=".repeat(80));
		await collectBundle({
			mode: "revision",
			...(exactBase ? { revision: baseRevision } : { mergeBaseOf: baseRevision }),
			label: baseLabel,
			forceCleanBuild,
			packageDir,
			webpackDir,
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

		console.log(`\n${"=".repeat(80)}`);
		console.log("✓ Bundle collection and comparison complete!");
		console.log("=".repeat(80));

		// Delete the inner repo last, after the report is written and the completion banner is
		// shown, so the user has the results before this slow cleanup runs. (Re-created cheaply on
		// the next run; pass keepBaseRepo to retain it for debugging.)
		if (!keepBaseRepo && existsSync(innerRepoRoot)) {
			console.log(`\nDeleting inner base-repo at ${innerRepoRoot}...`);
			rmSync(innerRepoRoot, { recursive: true, force: true });
		}
	} catch (error) {
		console.error("\n✖ Error:", error instanceof Error ? error.message : String(error));
		throw error;
	}
}
