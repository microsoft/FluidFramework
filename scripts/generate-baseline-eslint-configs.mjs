#!/usr/bin/env node

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates a "baseline" set of eslint configs for diff review purposes.
 *
 * For each eslint.config.mts (and eslint.config.data.mts) on the current branch,
 * this script finds the corresponding old .eslintrc.cjs (or .eslintrc.data.cjs)
 * content from the commit just before the flat-config migration PR landed, and
 * overwrites the new file with the old content.
 *
 * This creates a branch where the only diff vs the real branch is the actual
 * content change from old → new config format, making review much easier.
 *
 * Usage:
 *   node scripts/generate-baseline-eslint-configs.mjs
 *
 * Regeneration workflow (after preserve-eslint-comments is updated):
 *   git checkout lint/baseline-flat-config-migration
 *   git reset --hard preserve-eslint-comments
 *   node scripts/generate-baseline-eslint-configs.mjs
 *   git add -A && git commit -m "chore: regenerate baseline eslint configs"
 *   git push --force-with-lease
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

// Parent commit of PR #26054's merge — the last commit with old .eslintrc.cjs files
const BASELINE_COMMIT = "7a050c953e944c0ea0db8c1fe9b92e693dbd743e";

/**
 * Maps a new eslint flat config filename to its old legacy config filename.
 *
 * @param {string} newPath - relative path like "packages/dds/tree/eslint.config.mts"
 * @returns {string} relative path like "packages/dds/tree/.eslintrc.cjs"
 */
function mapNewToOld(newPath) {
	const dir = dirname(newPath);
	const filename = newPath.split("/").pop();

	if (filename === "eslint.config.data.mts") {
		// Special case: eslint.config.data.mts → .eslintrc.data.cjs
		return dir === "." ? ".eslintrc.data.cjs" : `${dir}/.eslintrc.data.cjs`;
	}

	// Standard case: eslint.config.mts → .eslintrc.cjs
	return dir === "." ? ".eslintrc.cjs" : `${dir}/.eslintrc.cjs`;
}

/**
 * Reads a file from a specific git commit.
 *
 * @param {string} commit
 * @param {string} relativePath
 * @returns {string | null} file content, or null if the file doesn't exist at that commit
 */
function gitShowFile(commit, relativePath) {
	try {
		return execFileSync("git", ["show", `${commit}:${relativePath}`], {
			cwd: repoRoot,
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch {
		return null;
	}
}

/**
 * Finds all eslint.config.mts and eslint.config.data.mts files tracked by git.
 *
 * @returns {string[]} relative paths
 */
function findNewConfigs() {
	const output = execFileSync(
		"git",
		["ls-files", "--", "**/eslint.config.mts", "**/eslint.config.data.mts"],
		{ cwd: repoRoot, encoding: "utf8" },
	);
	return output
		.trim()
		.split("\n")
		.filter((line) => line.length > 0);
}

function main() {
	const newConfigs = findNewConfigs();
	console.log(`Found ${newConfigs.length} eslint flat config files on current branch.\n`);

	let replaced = 0;
	let skipped = 0;
	const skippedFiles = [];

	for (const newPath of newConfigs) {
		const oldPath = mapNewToOld(newPath);
		const oldContent = gitShowFile(BASELINE_COMMIT, oldPath);

		if (oldContent === null) {
			skipped++;
			skippedFiles.push(newPath);
			continue;
		}

		const absPath = resolve(repoRoot, newPath);
		writeFileSync(absPath, oldContent, "utf8");
		replaced++;
	}

	console.log(`Replaced ${replaced} file(s) with old .eslintrc.cjs content.`);

	if (skippedFiles.length > 0) {
		console.log(`\nSkipped ${skipped} file(s) with no old equivalent:`);
		for (const f of skippedFiles) {
			console.log(`  - ${f}`);
		}
	}

	console.log("\nDone.");
}

main();
