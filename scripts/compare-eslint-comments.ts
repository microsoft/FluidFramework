/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Compares comments in legacy .eslintrc.cjs files with generated eslint.config.mts files
 * to identify any comments that were lost during the migration.
 *
 * Usage: pnpm tsx scripts/compare-eslint-comments.ts
 *
 * This script:
 * 1. Restores legacy .eslintrc.cjs files from git history (commit 346f8ad344^)
 * 2. Extracts comments from both legacy and current configs
 * 3. Reports any packages where comments are missing
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Commit before the flat config migration finalized (has legacy .eslintrc.cjs files)
const LEGACY_COMMIT = "346f8ad344^";

interface CommentComparison {
	packagePath: string;
	legacyComments: string[];
	currentComments: string[];
	missingComments: string[];
}

/**
 * Extract all comments from source code (single-line and multi-line)
 * Filters out copyright headers and eslint-disable comments.
 */
function extractComments(sourceCode: string): string[] {
	const comments: string[] = [];
	const lines = sourceCode.split("\n");

	let inMultiLineComment = false;
	let multiLineText = "";
	let skipCurrentMultiLine = false; // Track if we should skip the current multi-line comment

	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const line = lines[lineNum];

		if (inMultiLineComment) {
			const endIndex = line.indexOf("*/");
			if (endIndex !== -1) {
				if (!skipCurrentMultiLine) {
					multiLineText += "\n" + line.substring(0, endIndex + 2);
					const trimmed = multiLineText.trim();
					// Filter out copyright and eslint-disable comments
					if (
						trimmed.length > 0 &&
						!trimmed.includes("Copyright (c) Microsoft") &&
						!trimmed.includes("eslint-disable")
					) {
						comments.push(trimmed);
					}
				}
				inMultiLineComment = false;
				skipCurrentMultiLine = false;
				multiLineText = "";
			} else if (!skipCurrentMultiLine) {
				multiLineText += "\n" + line;
			}
		} else {
			let pos = 0;
			while (pos < line.length) {
				// Skip string literals
				if (line[pos] === '"' || line[pos] === "'" || line[pos] === "`") {
					const quote = line[pos];
					pos++;
					while (pos < line.length && line[pos] !== quote) {
						if (line[pos] === "\\" && pos + 1 < line.length) {
							pos++;
						}
						pos++;
					}
					pos++;
					continue;
				}

				// Single-line comment
				if (line[pos] === "/" && pos + 1 < line.length && line[pos + 1] === "/") {
					const commentText = line.substring(pos).trim();
					// Skip eslint-disable comments and generated file markers
					if (
						!commentText.includes("eslint-disable") &&
						!commentText.includes("GENERATED FILE")
					) {
						comments.push(commentText);
					}
					break;
				}

				// Multi-line comment start
				if (line[pos] === "/" && pos + 1 < line.length && line[pos + 1] === "*") {
					// Skip copyright headers (start with /*!)
					if (line[pos + 2] === "!") {
						const endIndex = line.indexOf("*/", pos + 2);
						if (endIndex !== -1) {
							pos = endIndex + 2;
							continue;
						} else {
							// Multi-line copyright header - skip until end
							inMultiLineComment = true;
							skipCurrentMultiLine = true;
							break;
						}
					}

					const endIndex = line.indexOf("*/", pos + 2);
					if (endIndex !== -1) {
						const commentText = line.substring(pos, endIndex + 2).trim();
						if (
							!commentText.includes("eslint-disable") &&
							!commentText.includes("Copyright (c) Microsoft")
						) {
							comments.push(commentText);
						}
						pos = endIndex + 2;
						continue;
					} else {
						inMultiLineComment = true;
						skipCurrentMultiLine = false;
						multiLineText = line.substring(pos);
						break;
					}
				}

				pos++;
			}
		}
	}

	return comments;
}

/**
 * Get legacy config content from git history
 */
function getLegacyConfig(packageDir: string): string | null {
	const relativePath = path.relative(repoRoot, path.join(packageDir, ".eslintrc.cjs"));
	try {
		const content = execSync(`git show ${LEGACY_COMMIT}:${relativePath}`, {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return content;
	} catch {
		return null;
	}
}

/**
 * Find all packages with eslint.config.mts files
 */
function findPackagesWithFlatConfig(): string[] {
	const packages: string[] = [];
	const topDirs = ["packages", "experimental", "examples", "azure", "tools"];

	function searchDir(dir: string): void {
		try {
			const { readdirSync, statSync } = require("fs");
			const entries = readdirSync(dir);

			for (const entry of entries) {
				if (entry === "node_modules") continue;

				const fullPath = path.join(dir, entry);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					const flatConfigPath = path.join(fullPath, "eslint.config.mts");
					if (existsSync(flatConfigPath)) {
						packages.push(fullPath);
					}
					searchDir(fullPath);
				}
			}
		} catch {
			// Ignore errors
		}
	}

	for (const top of topDirs) {
		searchDir(path.join(repoRoot, top));
	}

	return packages.sort();
}

/**
 * Normalize comment for comparison (remove whitespace variations)
 */
function normalizeComment(comment: string): string {
	return comment
		.replace(/^\/\/\s*/, "")
		.replace(/^\/\*\s*/, "")
		.replace(/\s*\*\/$/, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/**
 * Compare comments between legacy and current configs
 */
function compareComments(packageDir: string): CommentComparison | null {
	const legacyContent = getLegacyConfig(packageDir);
	if (!legacyContent) {
		return null; // No legacy config in history
	}

	const flatConfigPath = path.join(packageDir, "eslint.config.mts");
	if (!existsSync(flatConfigPath)) {
		return null;
	}

	const currentContent = readFileSync(flatConfigPath, "utf8");

	const legacyComments = extractComments(legacyContent);
	const currentComments = extractComments(currentContent);

	// Normalize for comparison
	const normalizedCurrent = new Set(currentComments.map(normalizeComment));

	const missingComments: string[] = [];
	for (let i = 0; i < legacyComments.length; i++) {
		const normalized = normalizeComment(legacyComments[i]);
		if (normalized.length > 0 && !normalizedCurrent.has(normalized)) {
			missingComments.push(`Line ${i + 1}: ${legacyComments[i].substring(0, 80)}...`);
		}
	}

	return {
		packagePath: path.relative(repoRoot, packageDir),
		legacyComments,
		currentComments,
		missingComments,
	};
}

async function main(): Promise<void> {
	console.log("Comparing ESLint config comments...\n");
	console.log(`Legacy commit: ${LEGACY_COMMIT}\n`);

	const packages = findPackagesWithFlatConfig();
	console.log(`Found ${packages.length} packages with flat configs\n`);

	let matchCount = 0;
	let mismatchCount = 0;
	const mismatches: CommentComparison[] = [];

	for (const pkg of packages) {
		const comparison = compareComments(pkg);
		if (!comparison) continue;

		const relativePath = comparison.packagePath;

		if (comparison.missingComments.length === 0) {
			console.log(
				`✅ ${relativePath}: ${comparison.legacyComments.length} comments (match)`,
			);
			matchCount++;
		} else {
			console.log(
				`⚠️  ${relativePath}: legacy=${comparison.legacyComments.length}, current=${comparison.currentComments.length} (missing: ${comparison.missingComments.length})`,
			);
			for (const missing of comparison.missingComments) {
				console.log(`   - ${missing}`);
			}
			mismatchCount++;
			mismatches.push(comparison);
		}
	}

	console.log("\n" + "=".repeat(60) + "\n");
	console.log("Summary:");
	console.log(`  Matches: ${matchCount}`);
	console.log(`  Mismatches: ${mismatchCount}`);
	console.log(`  Total: ${matchCount + mismatchCount}`);

	if (mismatches.length > 0) {
		console.log(`\n⚠️  ${mismatches.length} packages have missing comments that need manual review.`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
