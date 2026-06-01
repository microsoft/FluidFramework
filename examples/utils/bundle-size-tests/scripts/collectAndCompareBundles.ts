/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, Flags } from "@oclif/core";
import { simpleGit } from "simple-git";

import { maybePrintHelp } from "./oclifHelp.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const bundleAnalysisDirectory = resolve(packageRoot, "bundleAnalysis");

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
	rev: string,
	otherRev = "HEAD",
): Promise<string | undefined> {
	try {
		const output = await simpleGit(packageRoot).raw(["merge-base", rev, otherRev]);
		const sha = output.trim();
		return sha.length > 0 ? sha : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Runs a TypeScript script via Node with jiti's ESM register hook.
 *
 * Using `--import jiti/register` avoids depending on the `jiti` binary being
 * on PATH (which is flaky on Windows / npm script contexts) while still
 * routing through a stable, documented entry point exposed by jiti's package
 * exports map.
 *
 * @param scriptName - Script file name under ./scripts/
 * @param scriptArgs - Arguments to forward to the script
 */
function runScript(scriptName: string, scriptArgs: string[]): void {
	const scriptPath = resolve(scriptDirectory, scriptName);
	const result = spawnSync(
		process.execPath,
		["--import", "jiti/register", scriptPath, ...scriptArgs],
		{
			cwd: packageRoot,
			stdio: "inherit",
		},
	);

	if (result.error !== undefined) {
		throw new Error(`Failed to launch script ${scriptName}: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(
			`Script ${scriptName} exited with code ${result.status ?? "null (signal)"}.`,
		);
	}
}

/**
 * Orchestrates: collectBundle.ts (local), then collectBundle.ts (revision),
 * then compareBundles.ts.
 *
 * Labels (used as bundleAnalysis subdirectory names) are determined automatically:
 * the local bundle is saved under "current" and the base bundle under "main",
 * regardless of the resolved revision SHA, so that compareBundles.ts can find
 * both directories.
 */
class CollectAndCompareBundlesCommand extends Command {
	public static override readonly description =
		"Run collectBundle.ts twice (local + revision merge-base) and then compareBundles.ts. " +
		"The outer repo's working tree, branch, and stash are never modified.";

	public static override readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --base-revision main",
		"<%= config.bin %> <%= command.id %> --base-revision client_v2.100.0",
		"<%= config.bin %> <%= command.id %> --force-clean-build --skip-compare",
	];

	public static override readonly flags = {
		"base-revision": Flags.string({
			description:
				"Revision to use as the comparison baseline (branch, tag, or commit SHA). " +
				"The actual base used is the merge-base of HEAD and this revision (the fork " +
				"point), so worktree-based setups where 'main' is in an unusual location " +
				"still produce the expected comparison.",
			default: "main",
		}),
		"skip-compare": Flags.boolean({
			description: "Collect both bundles, but skip the comparison step.",
			default: false,
		}),
		"force-clean-build": Flags.boolean({
			description:
				"Run the full workspace clean before each build. Off by default; opt in " +
				"when stale incremental build state may interfere with the current revision.",
			default: false,
		}),
		"keep-base-repo": Flags.boolean({
			description:
				"For debugging only: keep the inner base-repo clone after collecting the " +
				"base bundle. By default the inner repo is deleted once stats are saved, " +
				"since it can be re-created cheaply via shallow clone on the next run. " +
				"Pass this flag to inspect the inner repo's working tree or build output " +
				"(e.g. when a build is failing inside the inner repo).",
			default: false,
		}),
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(CollectAndCompareBundlesCommand);

		const baseRevisionInput = flags["base-revision"];
		const resolvedBaseRevision = await resolveMergeBase(baseRevisionInput);
		if (resolvedBaseRevision === undefined) {
			this.error(
				`Could not find merge-base of HEAD and "${baseRevisionInput}". ` +
					`Ensure the revision exists locally (e.g. "git fetch origin ${baseRevisionInput}").`,
				{ exit: 1 },
			);
		}
		if (resolvedBaseRevision !== baseRevisionInput) {
			console.log(
				`Resolved --base-revision "${baseRevisionInput}" to merge-base ${resolvedBaseRevision}.`,
			);
		}
		const baseRevision = resolvedBaseRevision;
		// compareBundles.ts reads from a fixed base label ("main"); pin the base
		// bundle's directory name to that regardless of which revision we resolved.
		const baseLabel = "main";
		// The current side is timestamped (unix epoch seconds) so successive runs,
		// which may carry different uncommitted changes, don't clobber each other.
		// We pass the same label to collectBundle (--label) and compareBundles
		// (--current-label) so they agree on the directory.
		const currentLabel = `current_${Math.floor(Date.now() / 1000)}`;

		const skipCompare = flags["skip-compare"];
		const forceCleanBuildFlag = flags["force-clean-build"];
		const keepBaseRepo = flags["keep-base-repo"];

		const sharedCollectArgs: string[] = [];
		if (forceCleanBuildFlag) {
			sharedCollectArgs.push("--force-clean-build");
		}

		// The inner repo is only ever checked out at a clean revision; its build
		// output for a given SHA is deterministic, so a cached base report from a
		// prior run for the same SHA can be reused. We track the SHA used to produce
		// the base report in a sidecar revision.txt file.
		const baseLabelDirectory = resolve(bundleAnalysisDirectory, baseLabel);
		const baseAnalyzerPath = resolve(baseLabelDirectory, "analyzer.json");
		const baseRevisionMarkerPath = resolve(baseLabelDirectory, "revision.txt");
		const cachedBaseRevision = existsSync(baseRevisionMarkerPath)
			? readFileSync(baseRevisionMarkerPath, "utf8").trim()
			: undefined;
		const baseStatsAreCached =
			!forceCleanBuildFlag && existsSync(baseAnalyzerPath) && cachedBaseRevision === baseRevision;

		try {
			console.log(`\n${"=".repeat(80)}`);
			console.log(`Collecting local bundle (label: ${currentLabel})...`);
			console.log("=".repeat(80));
			runScript("collectBundle.ts", [
				"--mode",
				"local",
				"--label",
				currentLabel,
				...sharedCollectArgs,
			]);

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
				runScript("collectBundle.ts", [
					"--mode",
					"revision",
					"--revision",
					baseRevision,
					"--label",
					baseLabel,
					...sharedCollectArgs,
				]);
				// Record the SHA that produced this report so a subsequent run
				// against the same merge-base can skip the rebuild.
				mkdirSync(baseLabelDirectory, { recursive: true });
				writeFileSync(baseRevisionMarkerPath, `${baseRevision}\n`);

				// Delete the inner repo now that the report is saved. It's a
				// shallow clone of the outer repo's `origin`, so re-creating it
				// on the next run is cheap; keeping it around just consumes disk
				// (hundreds of MB once dependencies are installed).
				if (!keepBaseRepo) {
					const innerRepoRoot = resolve(bundleAnalysisDirectory, "base-repo");
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
				runScript("compareBundles.ts", ["--current-label", currentLabel]);
			}

			console.log(`\n${"=".repeat(80)}`);
			console.log("✓ Bundle collection and comparison complete!");
			console.log("=".repeat(80));
		} catch (error) {
			console.error("\n✖ Error:", error instanceof Error ? error.message : String(error));
			throw error;
		}
	}
}

if (
	!maybePrintHelp(
		process.argv.slice(2),
		"collectAndCompareBundles.ts",
		CollectAndCompareBundlesCommand,
	)
) {
	await CollectAndCompareBundlesCommand.run(process.argv.slice(2), import.meta.url);
}
