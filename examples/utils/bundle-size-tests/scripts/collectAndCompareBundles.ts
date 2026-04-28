/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");

/**
 * Resolves a committish (branch, tag, or SHA) to the merge-base with the outer
 * repo's current HEAD. Returns the full SHA, or undefined if the rev cannot be
 * resolved (e.g. unknown branch, detached state with no shared history).
 *
 * Using merge-base instead of the raw branch tip means the comparison is taken
 * against the actual fork point, which is what users typically want — and it
 * works for worktree-based setups where `main` may not exist as a local branch
 * at the location they expect.
 */
function resolveMergeBase(rev: string): string | undefined {
	const result = spawnSync("git", ["merge-base", "HEAD", rev], {
		cwd: packageRoot,
		encoding: "utf-8",
	});
	if (result.status !== 0) {
		return undefined;
	}
	const sha = result.stdout.trim();
	return sha.length > 0 ? sha : undefined;
}

/**
 * Checks if a flag is present in the command-line argument list.
 *
 * @param argv - The command-line argument list
 * @param flagName - The flag to check for
 * @returns True if the flag is present, false otherwise
 */
function hasFlag(argv: string[], flagName: string): boolean {
	return argv.includes(flagName);
}

/**
 * Extracts the value of a command-line option from the argument list.
 *
 * @param argv - The command-line argument list
 * @param optionName - The name of the option to extract
 * @returns The option value, or undefined if not found
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
	// Bump the V8 heap so compareBundles.ts can hold two decompressed webpack
	// stats objects in memory without hitting the default ~4 GB OOM.
	const result = spawnSync(
		process.execPath,
		["--max-old-space-size=8192", "--import", "jiti/register", scriptPath, ...scriptArgs],
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
 * Prints the help text describing usage and options.
 */
function printHelp(): void {
	console.log(`
Usage:
  jiti ./scripts/collectAndCompareBundles.ts [options]

Runs collectBundle.ts twice — once in local mode for the outer repo, once in
revision mode for a separate inner enlistment checked out at the base revision —
and then runs compareBundles.ts to produce the diff. The outer repo's working
tree, branch, and stash are never modified.

Options:
  --help, -h
    Show this help text and exit.

  --base-revision <rev>     Revision to use as the comparison baseline. Branch,
                            tag, or commit SHA. The actual base used is the
                            merge-base of HEAD and this revision (i.e. the fork
                            point), so worktree-based setups where 'main' is in
                            an unusual location still produce the expected
                            comparison. Default: main.
  --skip-compare            Collect both bundles, skip the comparison step.
  --force-clean-build       Run the full workspace clean before each build.
                            Off by default; opt in when stale incremental build
                            state may interfere with the current revision.

Labels (used as bundleAnalysis subdirectory names) are determined automatically:
the local bundle is saved under "current" and the base bundle under the
sanitized base revision name.

Examples:
  jiti ./scripts/collectAndCompareBundles.ts
  jiti ./scripts/collectAndCompareBundles.ts --base-revision main
  jiti ./scripts/collectAndCompareBundles.ts --base-revision v2.20.0
  jiti ./scripts/collectAndCompareBundles.ts --force-clean-build --skip-compare
`);
}

/**
 * Main entry point: runs collection (local + revision) followed by comparison.
 *
 * @param argv - The command-line argument list
 */
function main(argv: string[]): void {
	if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
		printHelp();
		return;
	}

	const baseRevisionInput = getOptionValue(argv, "--base-revision") ?? "main";
	const resolvedBaseRevision = resolveMergeBase(baseRevisionInput);
	if (resolvedBaseRevision === undefined) {
		throw new Error(
			`Could not find merge-base of HEAD and "${baseRevisionInput}". ` +
				`Ensure the revision exists locally (e.g. "git fetch origin ${baseRevisionInput}").`,
		);
	}
	if (resolvedBaseRevision !== baseRevisionInput) {
		console.log(
			`Resolved --base-revision "${baseRevisionInput}" to merge-base ${resolvedBaseRevision}.`,
		);
	}
	const baseRevision = resolvedBaseRevision;
	// compareBundles.ts reads from fixed label directories ("main" / "current"),
	// so pin the base bundle's directory name to "main" regardless of which
	// revision we resolved to.
	const baseLabel = "main";
	const currentLabel = "current";

	const skipCompare = hasFlag(argv, "--skip-compare");
	const forceCleanBuildFlag = hasFlag(argv, "--force-clean-build");

	const sharedCollectArgs: string[] = [];
	if (forceCleanBuildFlag) {
		sharedCollectArgs.push("--force-clean-build");
	}

	try {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`Collecting local bundle (label: ${currentLabel})...`);
		console.log("=".repeat(80));
		runScript("collectBundle.ts", ["--mode", "local", ...sharedCollectArgs]);

		console.log(`\n${"=".repeat(80)}`);
		console.log(`Collecting base bundle (revision: ${baseRevision}, label: ${baseLabel})...`);
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

		if (!skipCompare) {
			console.log(`\n${"=".repeat(80)}`);
			console.log("Running bundle comparison...");
			console.log("=".repeat(80));
			runScript("compareBundles.ts", []);
		}

		console.log(`\n${"=".repeat(80)}`);
		console.log("✓ Bundle collection and comparison complete!");
		console.log("=".repeat(80));
	} catch (error) {
		console.error("\n✖ Error:", error instanceof Error ? error.message : String(error));
		throw error;
	}
}

main(process.argv.slice(2));
