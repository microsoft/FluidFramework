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
 * Sanitizes a string for use as a filename.
 *
 * @param value - The string to sanitize
 * @returns The sanitized string safe for use as a filename
 */
function sanitizeForFileName(value: string): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all -- Keep regex replacement for older TS lib targets.
	return value.replace(/[^\w.-]/g, "_");
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
 * @param envOverrides - Extra environment variables to set for the child process
 */
function runScript(
	scriptName: string,
	scriptArgs: string[],
	envOverrides?: Record<string, string>,
): void {
	const scriptPath = resolve(scriptDirectory, scriptName);
	const result = spawnSync(
		process.execPath,
		["--import", "jiti/register", scriptPath, ...scriptArgs],
		{
			cwd: packageRoot,
			stdio: "inherit",
			env: envOverrides === undefined ? process.env : { ...process.env, ...envOverrides },
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
                            tag, or commit SHA. Default: main.
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

	const baseRevision = getOptionValue(argv, "--base-revision") ?? "main";
	// Labels mirror the defaults baked into collectBundle.ts: revision-mode runs
	// save under the sanitized revision name, local-mode runs save under "current".
	const baseLabel = sanitizeForFileName(baseRevision);
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
			...sharedCollectArgs,
		]);

		if (!skipCompare) {
			console.log(`\n${"=".repeat(80)}`);
			console.log("Running bundle comparison...");
			console.log("=".repeat(80));
			// compareBundles.ts auto-detects the "current" label from
			// BUILD_SOURCEBRANCHNAME (sanitized internally), so we use it to plumb
			// through the explicit current label without modifying compareBundles.
			runScript("compareBundles.ts", ["--base-branch", baseLabel], {
				BUILD_SOURCEBRANCHNAME: currentLabel,
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

main(process.argv.slice(2));
