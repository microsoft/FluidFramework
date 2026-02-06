/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates ESLint 9 flat config files for packages that currently use legacy .eslintrc.cjs configs.
 *
 * Shared Config Detection:
 *  - Detects `.eslintrc.data.cjs` files which are shared config files that export configuration data
 *  - Creates corresponding `eslint.config.data.mts` flat config files
 *  - When packages extend from these shared configs, imports are added instead of duplicating rules
 *
 * Heuristic:
 *  - If .eslintrc.cjs extends "@fluidframework/eslint-config-fluid/strict" => use strict flat config.
 *  - If it extends "@fluidframework/eslint-config-fluid/minimal-deprecated" => use minimalDeprecated.
 *  - Otherwise (includes base or recommended) => use recommended.
 *  - Extracts local rules and overrides from .eslintrc.cjs and includes them in the flat config.
 *
 * Output: eslint.config.mjs (or .mts with --typescript) alongside the existing .eslintrc.cjs (which is left intact for now).
 *
 * Options:
 *   --finalize    Perform a final migration: generate configs without "GENERATED FILE" boilerplate,
 *                 then delete the source .eslintrc.cjs and .eslintignore files.
 *   --typescript  Generate TypeScript config files (.mts) instead of JavaScript (.mjs).
 *                 Requires 'jiti' to be installed (can be at workspace root).
 *                 See: https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Parse command-line arguments
const args = process.argv.slice(2);
const finalizeMode = args.includes("--finalize");
const typescriptMode = args.includes("--typescript");

interface PackageTarget {
	packageDir: string;
	legacyConfigPath: string;
	flatVariant: "strict" | "minimalDeprecated" | "recommended";
	legacyConfig?: unknown;
	eslintIgnorePatterns?: string[];
	/** Rules and overrides merged from local extends (e.g., ../../.eslintrc.cjs) */
	extendedLocalConfig?: { rules?: Record<string, unknown>; overrides?: unknown[] };
	/** Path to a shared flat config to import from (relative to packageDir) */
	sharedFlatConfigImport?: string;
	/** Named exports from shared config that should be imported */
	sharedConfigNamedImports?: string[];
	/** Original source code of the legacy config */
	legacyConfigSource?: string;
	/** Comment data including rule comments and trailing comments from the legacy config */
	commentData?: CommentData;
	/** Map of override indices to their block-level comments */
	overrideCommentMap?: OverrideCommentMap;
}

/** Information about comments associated with a rule */
interface CommentInfo {
	/** Comments appearing on lines immediately before the rule */
	leadingComments: string[];
	/** Comment appearing on the same line after the rule value */
	inlineComment?: string;
}

/** Map of rule identifiers to their comment info */
type CommentMap = Map<string, CommentInfo>;

/** Trailing comments that appear at the end of a rules block (like #endregion) */
interface TrailingComments {
	/** Key format: "rules" for top-level, "overrides[N].rules" for override blocks */
	[context: string]: string[];
}

/** Combined comment data including both rule comments and trailing comments */
interface CommentData {
	/** Comments associated with specific rules */
	ruleComments: CommentMap;
	/** Comments at the end of rules blocks */
	trailingComments: TrailingComments;
	/** Comments that don't fit into rules/overrides contexts (from settings, extends, etc.) */
	orphanedComments: string[];
}

/** A comment extracted from source code with position info */
interface SourceComment {
	text: string;
	line: number; // 0-based line number
	endLine: number;
	isMultiLine: boolean;
}

/** Location of a rule definition in source code */
interface RuleLocation {
	/** The rule name (e.g., "@typescript-eslint/no-shadow") */
	ruleName: string;
	/** 0-based line number where the rule is defined */
	line: number;
	/** Context: top-level rules or within an override */
	context: "rules" | "overrides";
	/** If in overrides, which override index (0-based) */
	overrideIndex?: number;
}

/** Location of an override block start in source code */
interface OverrideBlockLocation {
	/** 0-based line number where the override block starts (opening brace) */
	line: number;
	/** The override index (0-based) */
	overrideIndex: number;
}

/** Location of a rules block in source code */
interface RulesBlockLocation {
	/** 0-based line number where the rules block starts */
	startLine: number;
	/** 0-based line number where the rules block ends (closing brace) */
	endLine: number;
	/** Context: "rules" for top-level, "overrides[N].rules" for override blocks */
	context: string;
}

/** Map of override indices to their block-level comments */
type OverrideCommentMap = Map<number, string[]>;

interface SharedConfigTarget {
	configPath: string;
	alternativePaths?: string[];
	outputPath: string;
	legacyConfig: unknown;
	/** The raw loaded module exports, including any named exports like lists */
	rawModuleExports: unknown;
}

/**
 * Extract all comments from JavaScript/TypeScript source code.
 * Uses regex-based parsing to find single-line and multi-line comments.
 */
function extractComments(sourceCode: string): SourceComment[] {
	const comments: SourceComment[] = [];
	const lines = sourceCode.split("\n");

	// Track multi-line comment state
	let inMultiLineComment = false;
	let multiLineStart = -1;
	let multiLineText = "";

	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const line = lines[lineNum];

		if (inMultiLineComment) {
			// Continue multi-line comment
			const endIndex = line.indexOf("*/");
			if (endIndex !== -1) {
				// End of multi-line comment
				multiLineText += "\n" + line.substring(0, endIndex + 2);
				comments.push({
					text: multiLineText,
					line: multiLineStart,
					endLine: lineNum,
					isMultiLine: true,
				});
				inMultiLineComment = false;
				multiLineText = "";
				multiLineStart = -1;

				// Check for comments after the multi-line end on same line
				const restOfLine = line.substring(endIndex + 2);
				const singleLineMatch = restOfLine.match(/\/\/(.*)$/);
				if (singleLineMatch) {
					comments.push({
						text: "//" + singleLineMatch[1],
						line: lineNum,
						endLine: lineNum,
						isMultiLine: false,
					});
				}
			} else {
				multiLineText += "\n" + line;
			}
		} else {
			// Look for single-line comments and multi-line comment starts
			// Skip comments inside string literals (simplified check)
			let pos = 0;
			while (pos < line.length) {
				// Skip string literals (including template literals)
				if (line[pos] === '"' || line[pos] === "'" || line[pos] === "`") {
					const quote = line[pos];
					pos++;
					while (pos < line.length && line[pos] !== quote) {
						if (line[pos] === "\\" && pos + 1 < line.length) {
							pos++; // Skip escaped chars
						}
						pos++;
					}
					pos++;
					continue;
				}

				// Check for single-line comment (with bounds check)
				if (line[pos] === "/" && pos + 1 < line.length && line[pos + 1] === "/") {
					const commentText = line.substring(pos);
					comments.push({
						text: commentText,
						line: lineNum,
						endLine: lineNum,
						isMultiLine: false,
					});
					break; // Rest of line is comment
				}

				// Check for multi-line comment start (with bounds check)
				if (line[pos] === "/" && pos + 1 < line.length && line[pos + 1] === "*") {
					const endIndex = line.indexOf("*/", pos + 2);
					if (endIndex !== -1) {
						// Single-line multi-line comment (e.g., /* comment */)
						const commentText = line.substring(pos, endIndex + 2);
						comments.push({
							text: commentText,
							line: lineNum,
							endLine: lineNum,
							isMultiLine: true,
						});
						pos = endIndex + 2;
						continue;
					} else {
						// Start of multi-line comment spanning multiple lines
						inMultiLineComment = true;
						multiLineStart = lineNum;
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
 * Find the line numbers where ESLint rules are defined in the source code.
 * Handles both top-level rules and rules within overrides.
 * Also returns the locations of override block starts and rules block boundaries.
 */
function findRuleLocations(sourceCode: string): {
	rules: RuleLocation[];
	overrideBlocks: OverrideBlockLocation[];
	rulesBlocks: RulesBlockLocation[];
} {
	const locations: RuleLocation[] = [];
	const overrideBlocks: OverrideBlockLocation[] = [];
	const rulesBlocks: RulesBlockLocation[] = [];
	const lines = sourceCode.split("\n");

	// Track whether we're inside an overrides array and which override index
	let inOverrides = false;
	let overrideIndex = -1;
	let overrideBraceDepth = 0;
	let inRulesBlock = false;
	let rulesBraceDepth = 0;
	let currentRulesBlockStart = -1;
	let currentRulesBlockContext = "";

	// Pattern to match rule definitions: "rule-name": value or 'rule-name': value
	const rulePattern = /^\s*["']([^"']+)["']\s*:/;

	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const line = lines[lineNum];

		// Count braces on this line (excluding those in strings)
		let openBraces = 0;
		let closeBraces = 0;
		let inString = false;
		let stringChar = "";
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inString) {
				if (ch === "\\" && i + 1 < line.length) {
					i++; // Skip escaped character
				} else if (ch === stringChar) {
					inString = false;
				}
			} else {
				if (ch === '"' || ch === "'" || ch === "`") {
					inString = true;
					stringChar = ch;
				} else if (ch === "{") {
					openBraces++;
				} else if (ch === "}") {
					closeBraces++;
				}
			}
		}

		// Track overrides array entry/exit
		if (line.includes("overrides:") && line.includes("[")) {
			inOverrides = true;
			overrideIndex = -1;
		}

		// Track individual override objects within the overrides array
		if (inOverrides) {
			if (openBraces > 0 && overrideBraceDepth === 0) {
				overrideIndex++;
				// Record the start of this override block
				overrideBlocks.push({
					line: lineNum,
					overrideIndex,
				});
			}
			overrideBraceDepth += openBraces - closeBraces;

			if (overrideBraceDepth === 0 && line.includes("]")) {
				inOverrides = false;
				overrideIndex = -1;
			}
		}

		// Track rules block entry/exit using brace depth
		if (line.match(/\brules\s*:\s*{/)) {
			inRulesBlock = true;
			rulesBraceDepth = 1; // We just entered the rules block
			currentRulesBlockStart = lineNum;
			currentRulesBlockContext = inOverrides ? `overrides[${overrideIndex}].rules` : "rules";
			// Adjust for any closing braces on the same line
			rulesBraceDepth += openBraces - 1; // -1 because we already counted the opening brace
			rulesBraceDepth -= closeBraces;
		} else if (inRulesBlock) {
			rulesBraceDepth += openBraces - closeBraces;
			if (rulesBraceDepth <= 0) {
				// Record the end of this rules block
				rulesBlocks.push({
					startLine: currentRulesBlockStart,
					endLine: lineNum,
					context: currentRulesBlockContext,
				});
				inRulesBlock = false;
				rulesBraceDepth = 0;
				currentRulesBlockStart = -1;
				currentRulesBlockContext = "";
			}
		}

		// Check if this line defines a rule (must be at depth 1 in rules block)
		if (inRulesBlock && rulesBraceDepth === 1) {
			const match = line.match(rulePattern);
			if (match) {
				const ruleName = match[1];
				locations.push({
					ruleName,
					line: lineNum,
					context: inOverrides ? "overrides" : "rules",
					overrideIndex: inOverrides ? overrideIndex : undefined,
				});
			}
		}
	}

	return { rules: locations, overrideBlocks, rulesBlocks };
}

/**
 * Associate comments with override blocks.
 * Comments appearing before or at the start of an override block are captured.
 * This handles both:
 * - Comments before the opening brace: `// comment\n{`
 * - Comments inside the block before files: `{\n// comment\nfiles: [...]`
 */
function associateCommentsWithOverrides(
	comments: SourceComment[],
	overrideBlocks: OverrideBlockLocation[],
	sourceCode: string,
): OverrideCommentMap {
	const overrideCommentMap: OverrideCommentMap = new Map();
	const lines = sourceCode.split("\n");

	// Build a set of lines that are override block starts
	const overrideLines = new Set(overrideBlocks.map((o) => o.line));

	for (const override of overrideBlocks) {
		const blockComments: string[] = [];

		// Look back up to 5 lines for comments before this override block
		// Stop when we hit another override block or the overrides: [ line
		for (let lookback = 1; lookback <= 5; lookback++) {
			const checkLine = override.line - lookback;
			if (checkLine < 0) break;

			const lineContent = lines[checkLine];

			// Stop if we hit another override block or the overrides array declaration
			if (overrideLines.has(checkLine) || lineContent.includes("overrides:")) {
				break;
			}

			// Find comments on this line
			const commentsOnLine = comments.filter(
				(c) => c.line === checkLine || c.endLine === checkLine,
			);

			if (commentsOnLine.length > 0) {
				for (const comment of commentsOnLine) {
					blockComments.unshift(comment.text);
				}
			} else if (lineContent.trim() === "") {
				// Allow blank lines
				continue;
			} else if (lineContent.trim() === "{") {
				// Skip the opening brace line
				continue;
			} else {
				// Non-comment, non-blank line - stop looking
				break;
			}
		}

		// Also look forward inside the block for comments between { and files:
		// This is for the pattern: { \n // comment \n files: [...] }
		for (let lookahead = 1; lookahead <= 5; lookahead++) {
			const checkLine = override.line + lookahead;
			if (checkLine >= lines.length) break;

			const lineContent = lines[checkLine];

			// Stop if we hit the files: property or rules: property
			if (lineContent.match(/^\s*(files|rules|excludedFiles)\s*:/)) {
				break;
			}

			// Find comments on this line
			const commentsOnLine = comments.filter(
				(c) => c.line === checkLine || c.endLine === checkLine,
			);

			if (commentsOnLine.length > 0) {
				for (const comment of commentsOnLine) {
					blockComments.push(comment.text);
				}
			} else if (lineContent.trim() === "" || lineContent.trim() === "{") {
				// Allow blank lines and opening braces
				continue;
			} else {
				// Non-comment, non-blank line - stop looking
				break;
			}
		}

		if (blockComments.length > 0) {
			overrideCommentMap.set(override.overrideIndex, blockComments);
		}
	}

	return overrideCommentMap;
}

/**
 * Associate comments with the rules they document.
 * Comments on the lines immediately before a rule (allowing blank lines) are considered leading comments.
 * Comments on the same line after the rule definition are inline comments.
 * Also extracts trailing comments (like #endregion) that appear at the end of rules blocks.
 * Returns orphaned comments that don't fit into any rules context (e.g., in settings, extends).
 */
function associateCommentsWithRules(
	comments: SourceComment[],
	ruleLocations: RuleLocation[],
	rulesBlocks: RulesBlockLocation[],
	overrideBlocks: OverrideBlockLocation[],
	sourceCode: string,
): CommentData {
	const ruleComments: CommentMap = new Map();
	const trailingComments: TrailingComments = {};
	const lines = sourceCode.split("\n");

	// Track which comments have been used
	const usedComments = new Set<SourceComment>();

	// Sort rules by line number
	const sortedRules = [...ruleLocations].sort((a, b) => a.line - b.line);

	// Build a set of lines that are rule definition lines
	const ruleLines = new Set(sortedRules.map((r) => r.line));

	for (const rule of sortedRules) {
		const leadingComments: string[] = [];
		let inlineComment: string | undefined;

		// Find leading comments (comments on lines immediately before the rule)
		// Look back up to 15 lines to handle multi-line comment blocks
		// Stop when we hit another rule definition
		let blankLineCount = 0;
		for (let lookback = 1; lookback <= 15; lookback++) {
			const checkLine = rule.line - lookback;
			if (checkLine < 0) break;

			// Stop if we hit another rule definition
			if (ruleLines.has(checkLine)) {
				break;
			}

			// Find comments that start or end on this line
			const commentsOnLine = comments.filter(
				(c) => c.line === checkLine || c.endLine === checkLine,
			);

			if (commentsOnLine.length > 0) {
				// Reset blank line count when we find a comment
				blankLineCount = 0;
				for (const comment of commentsOnLine) {
					usedComments.add(comment);
					// Clean up comment text - remove // or /* */ markers
					let text = comment.text;
					if (text.startsWith("//")) {
						text = text.substring(2).trim();
					} else if (text.startsWith("/*") && text.endsWith("*/")) {
						text = text.substring(2, text.length - 2).trim();
					}

					// Skip empty comments
					if (text.length > 0) {
						leadingComments.unshift(text);
					}
				}
			} else {
				// Check if the line is blank or contains only whitespace/punctuation
				const lineContent = lines[checkLine]?.trim() ?? "";
				if (lineContent === "" || lineContent === "{" || lineContent === "},") {
					blankLineCount++;
					// Allow up to 2 blank/structural lines between comment and rule
					if (blankLineCount <= 2) {
						continue;
					}
				}
				// Non-comment, non-blank line (likely another rule or code) - stop looking
				break;
			}
		}

		// Find inline comment (comment on the same line as the rule, after the value)
		const inlineComments = comments.filter((c) => c.line === rule.line);
		if (inlineComments.length > 0) {
			// Take the last comment on the line (after the rule value)
			const lastComment = inlineComments[inlineComments.length - 1];
			usedComments.add(lastComment);
			let text = lastComment.text;
			if (text.startsWith("//")) {
				text = text.substring(2).trim();
			} else if (text.startsWith("/*") && text.endsWith("*/")) {
				text = text.substring(2, text.length - 2).trim();
			}
			if (text.length > 0) {
				inlineComment = text;
			}
		}

		// Only add to map if there are comments
		if (leadingComments.length > 0 || inlineComment) {
			// Create a unique key for the rule based on its context
			const key =
				rule.context === "overrides"
					? `overrides[${rule.overrideIndex}].rules.${rule.ruleName}`
					: `rules.${rule.ruleName}`;

			ruleComments.set(key, {
				leadingComments,
				inlineComment,
			});
		}
	}

	// Extract trailing comments (comments between the last rule and the closing brace)
	// These are typically #endregion markers
	for (const block of rulesBlocks) {
		// Find the last rule in this block
		const rulesInBlock = sortedRules.filter((r) => {
			if (block.context === "rules") {
				return r.context === "rules";
			}
			// Extract override index from context like "overrides[0].rules"
			const match = block.context.match(/overrides\[(\d+)\]/);
			if (!match) return false;
			return r.context === "overrides" && r.overrideIndex === parseInt(match[1], 10);
		});

		if (rulesInBlock.length === 0) continue;

		const lastRule = rulesInBlock[rulesInBlock.length - 1];
		const trailing: string[] = [];

		// Look for comments between the last rule and the end of the rules block
		for (let lineNum = lastRule.line + 1; lineNum < block.endLine; lineNum++) {
			const commentsOnLine = comments.filter(
				(c) => c.line === lineNum || c.endLine === lineNum,
			);

			for (const comment of commentsOnLine) {
				usedComments.add(comment);
				// Clean up comment text - remove // or /* */ markers
				let text = comment.text;
				if (text.startsWith("//")) {
					text = text.substring(2).trim();
				} else if (text.startsWith("/*") && text.endsWith("*/")) {
					text = text.substring(2, text.length - 2).trim();
				}

				// Keep the comment (including empty region markers)
				if (text.length > 0) {
					trailing.push(text);
				}
			}
		}

		if (trailing.length > 0) {
			trailingComments[block.context] = trailing;
		}
	}

	// Mark override block comments as used (they're handled separately)
	for (const override of overrideBlocks) {
		// Comments before override blocks
		for (let lookback = 1; lookback <= 5; lookback++) {
			const checkLine = override.line - lookback;
			if (checkLine < 0) break;
			const commentsOnLine = comments.filter(
				(c) => c.line === checkLine || c.endLine === checkLine,
			);
			for (const comment of commentsOnLine) {
				usedComments.add(comment);
			}
		}
		// Comments inside override blocks (after { before files:)
		for (let lookahead = 1; lookahead <= 5; lookahead++) {
			const checkLine = override.line + lookahead;
			if (checkLine >= lines.length) break;
			const lineContent = lines[checkLine];
			if (lineContent.match(/^\s*(files|rules|excludedFiles)\s*:/)) break;
			const commentsOnLine = comments.filter(
				(c) => c.line === checkLine || c.endLine === checkLine,
			);
			for (const comment of commentsOnLine) {
				usedComments.add(comment);
			}
		}
	}

	// Collect orphaned comments (not used by rules, trailing, or override blocks)
	// Skip the copyright header (first comment that starts with /*!)
	const orphanedComments: string[] = [];
	for (const comment of comments) {
		if (usedComments.has(comment)) continue;
		// Skip copyright header
		if (comment.text.startsWith("/*!")) continue;
		// Skip eslint-disable comments
		if (comment.text.includes("eslint-disable")) continue;

		// Clean up comment text
		let text = comment.text;
		if (text.startsWith("//")) {
			text = text.substring(2).trim();
		} else if (text.startsWith("/*") && text.endsWith("*/")) {
			text = text.substring(2, text.length - 2).trim();
		} else if (text.startsWith("/*")) {
			// Multi-line comment - keep as is but format
			text = text.substring(2).trim();
		}

		if (text.length > 0) {
			orphanedComments.push(text);
		}
	}

	return { ruleComments, trailingComments, orphanedComments };
}

/**
 * Find shared ESLint config files that should be converted to flat configs and imported by other packages.
 *
 * Currently supports:
 *  - `.eslintrc.data.cjs` files that export configuration objects
 *  - Automatically detects if there's a corresponding `.eslintrc.cjs` that re-exports the data config
 *
 * To add a new shared config pattern:
 *  1. Create a `.eslintrc.data.cjs` file in a directory (e.g., `my-folder/.eslintrc.data.cjs`)
 *  2. Export your shared rules/overrides: `module.exports = { rules: {...}, overrides: [...] }`
 *     - Or export via a property: `module.exports = { lintConfig: { rules: {...} } }`
 *  3. In child packages, extend from the parent: `extends: ["...", "../../.eslintrc.cjs"]`
 *  4. Run this script - it will:
 *     - Generate `my-folder/eslint.config.data.mts` with the shared flat config
 *     - Update child packages to import from `../../eslint.config.data.mts`
 */
async function findSharedConfigs(): Promise<SharedConfigTarget[]> {
	const results: SharedConfigTarget[] = [];
	const topDirs = ["packages", "experimental", "examples", "azure", "tools"];

	// Search for .eslintrc.data.cjs files that might be shared configs
	// These are configs that export configuration data to be consumed by other configs
	async function searchForDataConfigs(dir: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory() && entry.name !== "node_modules") {
				await searchForDataConfigs(fullPath);
			} else if (entry.isFile() && entry.name === ".eslintrc.data.cjs") {
				// Found a shared data config - load it
				try {
					const { execFileSync } = await import("child_process");
					const escapedPath = fullPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
					const result = execFileSync(
						"node",
						["-e", `console.log(JSON.stringify(require('${escapedPath}')))`],
						{ cwd: repoRoot, encoding: "utf8" },
					);
					const rawModuleExports = JSON.parse(result);

					// Extract the lintConfig property if it exists (e.g., examples/.eslintrc.data.cjs)
					const actualConfig = rawModuleExports.lintConfig || rawModuleExports;

					// Check if there's a corresponding .eslintrc.cjs that re-exports this
					const baseDir = path.dirname(fullPath);
					const reexportPath = path.join(baseDir, ".eslintrc.cjs");
					const alternativePaths: string[] = [];

					try {
						await fs.access(reexportPath);
						// Check if it references the .data.cjs file
						const reexportContent = await fs.readFile(reexportPath, "utf8");
						if (reexportContent.includes(".eslintrc.data.cjs")) {
							alternativePaths.push(reexportPath);
						}
					} catch {
						// No re-export file
					}

					// Generate output path: .eslintrc.data.cjs -> eslint.config.data.mts
					const outputPath = path.join(baseDir, "eslint.config.data.mts");

					results.push({
						configPath: fullPath,
						alternativePaths: alternativePaths.length > 0 ? alternativePaths : undefined,
						outputPath,
						legacyConfig: actualConfig,
						rawModuleExports,
					});
					console.log(`  Found shared config: ${path.relative(repoRoot, fullPath)}`);
				} catch (e) {
					console.error(`  Error loading shared config ${fullPath}:`, e);
				}
			}
		}
	}

	for (const top of topDirs) {
		await searchForDataConfigs(path.join(repoRoot, top));
	}

	return results;
}

async function findLegacyConfigs(
	sharedConfigs: SharedConfigTarget[],
): Promise<PackageTarget[]> {
	const results: PackageTarget[] = [];
	const topDirs = [
		"packages",
		"experimental",
		"examples",
		"azure",
		"tools",
		"server/routerlicious",
	]; // exclude common/build and server from traversal

	// Build a map of directory paths that have shared configs
	const sharedConfigDirs = new Set<string>();
	for (const shared of sharedConfigs) {
		sharedConfigDirs.add(path.dirname(shared.configPath));
	}

	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return; // Directory does not exist or cannot be read
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);

			// Legacy .eslintrc.cjs detection - only process if legacy config exists
			const legacyPath = path.join(full, ".eslintrc.cjs");
			try {
				await fs.access(legacyPath);
				const content = await fs.readFile(legacyPath, "utf8");
				let variant: PackageTarget["flatVariant"] = "recommended";

				// Check the extends array specifically to avoid false matches from rule names
				const extendsMatch = content.match(/extends:\s*\[([^\]]+)\]/s);
				if (extendsMatch) {
					const extendsContent = extendsMatch[1];
					if (extendsContent.includes("eslint-config-fluid/strict")) {
						variant = "strict";
					} else if (extendsContent.includes("eslint-config-fluid/minimal-deprecated")) {
						variant = "minimalDeprecated";
					}
				}

				// Load the legacy config to extract rules and overrides
				// We'll use a separate Node.js process to require() the CommonJS config
				let legacyConfig;
				try {
					const { execFileSync } = await import("child_process");
					// Escape legacyPath for JS string literal
					const legacyPathEscaped = legacyPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
					const result = execFileSync(
						"node",
						["-e", `console.log(JSON.stringify(require('${legacyPathEscaped}')))`],
						{ cwd: repoRoot, encoding: "utf8" },
					);
					legacyConfig = JSON.parse(result);
				} catch (e) {
					console.error(`Error: Could not load ${legacyPath}:`, e);
				}

				// Check for .eslintignore file
				let eslintIgnorePatterns: string[] | undefined;
				const eslintIgnorePath = path.join(full, ".eslintignore");
				try {
					const ignoreContent = await fs.readFile(eslintIgnorePath, "utf8");
					// Parse .eslintignore: each non-empty, non-comment line is a pattern
					eslintIgnorePatterns = ignoreContent
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => line.length > 0 && !line.startsWith("#"));
					if (eslintIgnorePatterns.length > 0) {
						console.log(
							`  Found .eslintignore with ${eslintIgnorePatterns.length} patterns in ${full}`,
						);
					} else {
						eslintIgnorePatterns = undefined;
					}
				} catch {
					// No .eslintignore file - check existing flat config for ignores blocks
					const ext = typescriptMode ? "mts" : "mjs";
					const flatConfigPath = path.join(full, `eslint.config.${ext}`);
					try {
						const flatContent = await fs.readFile(flatConfigPath, "utf8");
						// Look for ignores blocks that were migrated from .eslintignore
						// Pattern: { ignores: ["pattern1", "pattern2"] }
						const ignoresMatch = flatContent.match(
							/\/\/\s*Migrated from \.eslintignore\s*\n\s*\{\s*ignores:\s*\[([^\]]+)\]/,
						);
						if (ignoresMatch) {
							// Extract the patterns from the array
							const patternsStr = ignoresMatch[1];
							eslintIgnorePatterns = Array.from(
								patternsStr.matchAll(/"([^"]+)"|'([^']+)'/g),
							).map((m) => m[1] || m[2]);
							if (eslintIgnorePatterns.length > 0) {
								console.log(
									`  Preserving ${eslintIgnorePatterns.length} ignores from existing flat config in ${full}`,
								);
							} else {
								eslintIgnorePatterns = undefined;
							}
						}
					} catch {
						// No existing flat config - that's fine
					}
				}

				if (legacyConfig !== undefined) {
					// Check for local extends (e.g., "../../.eslintrc.cjs") and load their rules/overrides
					let extendedLocalConfig:
						| { rules?: Record<string, unknown>; overrides?: unknown[] }
						| undefined;
					let sharedFlatConfigImport: string | undefined;
					let sharedConfigNamedImports: string[] = [];
					let matchingSharedConfig: SharedConfigTarget | undefined;

					const config = legacyConfig as {
						extends?: string | string[];
						rules?: Record<string, unknown>;
						overrides?: unknown[];
					};
					if (config.extends) {
						const extendsList = Array.isArray(config.extends)
							? config.extends
							: [config.extends];
						for (const ext of extendsList) {
							// Only handle local relative paths to .eslintrc.cjs files
							if (ext.startsWith("./") || ext.startsWith("../")) {
								const extPath = path.resolve(full, ext);
								if (extPath.endsWith(".eslintrc.cjs") || extPath.endsWith(".cjs")) {
									// Check if this is a shared config we're generating a flat config for
									const matchingShared = sharedConfigs.find(
										(s) => s.configPath === extPath || s.alternativePaths?.includes(extPath),
									);
									if (matchingShared) {
										// Instead of merging, reference the shared flat config
										const relPath = path
											.relative(full, matchingShared.outputPath)
											.replace(/\\/g, "/");
										sharedFlatConfigImport = relPath.startsWith(".")
											? relPath
											: `./${relPath}`;
										// Detect which named exports are referenced in this config
										sharedConfigNamedImports = detectSharedConfigImports(
											content,
											matchingShared,
										);
										if (sharedConfigNamedImports.length > 0) {
											console.log(
												`  Will import shared config from ${sharedFlatConfigImport} with named exports: ${sharedConfigNamedImports.join(", ")}`,
											);
										} else {
											console.log(
												`  Will import shared config from ${sharedFlatConfigImport}`,
											);
										}
									} else {
										// Merge rules from extended configs that aren't shared flat configs
										try {
											const { execFileSync } = await import("child_process");
											const extPathEscaped = extPath
												.replace(/\\/g, "\\\\")
												.replace(/'/g, "\\'");
											const extResult = execFileSync(
												"node",
												["-e", `console.log(JSON.stringify(require('${extPathEscaped}')))`],
												{ cwd: repoRoot, encoding: "utf8" },
											);
											const extConfig = JSON.parse(extResult) as {
												rules?: Record<string, unknown>;
												overrides?: unknown[];
											};
											if (extConfig.rules || extConfig.overrides) {
												console.log(`  Merging extended config from ${ext}`);
												extendedLocalConfig = extendedLocalConfig ?? {};
												if (extConfig.rules) {
													extendedLocalConfig.rules = {
														...extendedLocalConfig.rules,
														...extConfig.rules,
													};
												}
												if (extConfig.overrides) {
													extendedLocalConfig.overrides = [
														...(extendedLocalConfig.overrides ?? []),
														...extConfig.overrides,
													];
												}
											}
										} catch (extErr) {
											console.warn(
												`  Warning: Could not load extended config ${ext}: ${extErr}`,
											);
										}
									}
								}
							}
						}
					}

					// Extract comments from the legacy config source
					const sourceComments = extractComments(content);
					const {
						rules: ruleLocations,
						overrideBlocks,
						rulesBlocks,
					} = findRuleLocations(content);
					const commentData = associateCommentsWithRules(
						sourceComments,
						ruleLocations,
						rulesBlocks,
						overrideBlocks,
						content,
					);
					const overrideCommentMap = associateCommentsWithOverrides(
						sourceComments,
						overrideBlocks,
						content,
					);

					results.push({
						packageDir: full,
						legacyConfigPath: legacyPath,
						flatVariant: variant,
						legacyConfig,
						eslintIgnorePatterns,
						extendedLocalConfig,
						sharedFlatConfigImport,
						sharedConfigNamedImports:
							sharedConfigNamedImports.length > 0 ? sharedConfigNamedImports : undefined,
						legacyConfigSource: content,
						commentData,
						overrideCommentMap,
					});
				} else {
					console.error(`Skipping package at ${full} due to failed legacy config load.`);
				}
			} catch {
				/* no legacy config here - skip this directory */
			}

			await walk(full);
		}
	}

	console.log("Scanning for legacy .eslintrc.cjs configs...");
	for (const top of topDirs) {
		console.log(`  Scanning ${top}/...`);
		await walk(path.join(repoRoot, top));
	}
	return results;
}

/**
 * Serialize a rules object with comments preserved from the legacy config.
 * Each rule can have leading comments (above) and/or inline comments (same line).
 * Also supports trailing comments at the end of the rules block (like #endregion).
 */
function serializeRulesWithComments(
	rules: Record<string, unknown>,
	indent: string,
	commentData?: CommentData,
	contextPrefix: string = "rules",
): string {
	const entries = Object.entries(rules);
	if (entries.length === 0) return "{}";

	const lines: string[] = [];
	for (const [ruleName, ruleValue] of entries) {
		const commentKey = `${contextPrefix}.${ruleName}`;
		const commentInfo = commentData?.ruleComments?.get(commentKey);

		// Add leading comments
		if (commentInfo?.leadingComments && commentInfo.leadingComments.length > 0) {
			for (const comment of commentInfo.leadingComments) {
				// Check if this is a multi-line comment (contains newlines)
				if (comment.includes("\n")) {
					// Format as a multi-line /* */ comment
					const commentLines = comment.split("\n");
					lines.push(`${indent}\t/*`);
					for (const commentLine of commentLines) {
						// Preserve the * prefix pattern, or add one if missing
						const trimmed = commentLine.trim();
						if (trimmed.startsWith("*")) {
							lines.push(`${indent}\t ${trimmed}`);
						} else if (trimmed.length > 0) {
							lines.push(`${indent}\t * ${trimmed}`);
						}
					}
					lines.push(`${indent}\t */`);
				} else {
					lines.push(`${indent}\t// ${comment}`);
				}
			}
		}

		// Serialize the rule value
		const valueStr = serializeValue(ruleValue, indent + "\t");
		const keyStr = JSON.stringify(ruleName);

		// Add inline comment if present
		if (commentInfo?.inlineComment) {
			lines.push(`${indent}\t${keyStr}: ${valueStr}, // ${commentInfo.inlineComment}`);
		} else {
			lines.push(`${indent}\t${keyStr}: ${valueStr},`);
		}
	}

	// Add trailing comments (like #endregion)
	const trailingComments = commentData?.trailingComments?.[contextPrefix];
	if (trailingComments && trailingComments.length > 0) {
		// Add a blank line before trailing comments for readability
		lines.push("");
		for (const comment of trailingComments) {
			lines.push(`${indent}\t// ${comment}`);
		}
	}

	return `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * Serialize a value to JavaScript/TypeScript code.
 * Unlike JSON.stringify, this preserves unquoted object keys and can handle special markers.
 */
function serializeValue(value: unknown, indent: string = ""): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";

	if (typeof value === "string") {
		// Check if this is a special marker for a variable reference
		if (value.startsWith("__SPREAD__")) {
			const varName = value.substring("__SPREAD__".length);
			return `...${varName}`;
		}
		// Check if this is a marker for a direct variable reference
		if (value.startsWith("__VAR__")) {
			const varName = value.substring("__VAR__".length);
			return varName;
		}
		return JSON.stringify(value);
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";

		// Check if any items are spread operators
		const hasSpread = value.some(
			(item) => typeof item === "string" && item.startsWith("__SPREAD__"),
		);

		if (hasSpread) {
			// Need to handle spread operators specially
			const items: string[] = [];
			for (const item of value) {
				if (typeof item === "string" && item.startsWith("__SPREAD__")) {
					items.push(serializeValue(item, indent));
				} else {
					items.push(serializeValue(item, indent));
				}
			}
			return `[${items.join(", ")}]`;
		}

		// Simple array without spreads
		const items = value.map((item) => serializeValue(item, indent));
		if (items.join(", ").length < 60) {
			return `[${items.join(", ")}]`;
		}
		return `[\n${indent}\t${items.join(`,\n${indent}\t`)},\n${indent}]`;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value);
		if (entries.length === 0) return "{}";

		const lines = entries.map(([key, val]) => {
			// Only quote keys that aren't valid JavaScript identifiers
			const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
			const keyStr = isValidIdentifier ? key : JSON.stringify(key);
			return `${indent}\t${keyStr}: ${serializeValue(val, indent + "\t")}`;
		});

		return `{\n${lines.join(",\n")},\n${indent}}`;
	}

	return JSON.stringify(value);
}

/**
 * Detect which named exports from shared configs are referenced in the legacy config source.
 */
function detectSharedConfigImports(
	legacyConfigSource: string,
	sharedConfig: SharedConfigTarget,
): string[] {
	const imports: string[] = [];

	// Get the named exports from the shared config
	const rawExports = sharedConfig.rawModuleExports as Record<string, unknown>;
	if (!rawExports) return imports;

	for (const [key, value] of Object.entries(rawExports)) {
		if (key === "lintConfig") continue;
		if (!Array.isArray(value)) continue;

		// Check if this variable is referenced in the source
		// Look for patterns like: importInternalModulesAllowedForTest.concat(...)
		// or destructured: const { importInternalModulesAllowedForTest } = require(...)
		const regex = new RegExp(`\\b${key}\\b`);
		if (regex.test(legacyConfigSource)) {
			imports.push(key);
		}
	}

	return imports;
}

/**
 * Parse source code to find concat patterns and map them to rules.
 * Returns a map of rule names to ALL concat patterns found (can be multiple per rule).
 */
function findConcatPatternsInSource(
	legacyConfigSource: string,
	namedImports: string[],
): Map<string, Array<{ varName: string; additionalItems: string[]; sourceIndex: number }>> {
	const patterns = new Map<
		string,
		Array<{ varName: string; additionalItems: string[]; sourceIndex: number }>
	>();

	for (const importName of namedImports) {
		// Pattern 1: "rule-name": ["error", { allow: importName.concat([...]) }]
		const concatPattern = new RegExp(
			`"([^"]+)":\\s*\\[[^\\[]*\\{[^}]*allow:\\s*${importName}\\.concat\\(\\[([^\\]]*)\\]\\)`,
			"gs",
		);

		let match;
		while ((match = concatPattern.exec(legacyConfigSource)) !== null) {
			const ruleName = match[1];
			const concatContent = match[2];
			const sourceIndex = match.index;

			// Extract string literals
			const additionalItems: string[] = [];
			const stringMatches = Array.from(concatContent.matchAll(/"([^"]+)"|'([^']+)'/g));
			for (const strMatch of stringMatches) {
				const str = strMatch[1] || strMatch[2];
				additionalItems.push(str);
			}

			if (!patterns.has(ruleName)) {
				patterns.set(ruleName, []);
			}
			patterns.get(ruleName)!.push({ varName: importName, additionalItems, sourceIndex });
		}

		// Pattern 2: "rule-name": ["error", { allow: importName }] (direct reference, no concat)
		const directPattern = new RegExp(
			`"([^"]+)":\\s*\\[[^\\[]*\\{[^}]*allow:\\s*${importName}\\s*[,}]`,
			"gs",
		);

		while ((match = directPattern.exec(legacyConfigSource)) !== null) {
			const ruleName = match[1];
			const sourceIndex = match.index;

			if (!patterns.has(ruleName)) {
				patterns.set(ruleName, []);
			}
			// Check if we already have a pattern for this rule at this location (concat takes precedence)
			const existing = patterns.get(ruleName)!;
			const alreadyExists = existing.some((p) => Math.abs(p.sourceIndex - sourceIndex) < 100);
			if (!alreadyExists) {
				patterns
					.get(ruleName)!
					.push({ varName: importName, additionalItems: [], sourceIndex });
			}
		}
	}

	return patterns;
}

/**
 * Process a rule configuration value, checking if it matches a concat pattern.
 */
function processRuleConfigForConcat(
	ruleName: string,
	ruleConfig: unknown,
	concatPatterns: Map<
		string,
		Array<{ varName: string; additionalItems: string[]; sourceIndex: number }>
	>,
): unknown {
	const patternList = concatPatterns.get(ruleName);
	if (!patternList || patternList.length === 0) return ruleConfig;

	// Use the first pattern and remove it (for cases where same rule appears multiple times)
	const pattern = patternList.shift()!;

	// If this rule has a concat pattern, process it
	if (Array.isArray(ruleConfig) && ruleConfig.length >= 2) {
		const [severity, options, ...rest] = ruleConfig;
		if (options && typeof options === "object" && "allow" in options) {
			// Replace the allow array with our spread pattern
			return [
				severity,
				{
					...options,
					"allow": ["__SPREAD__" + pattern.varName, ...pattern.additionalItems],
				},
				...rest,
			];
		}
	}

	return ruleConfig;
}

function buildSharedConfigContent(
	configDir: string,
	legacyConfig: unknown,
	finalize: boolean,
	typescript: boolean,
	/** The raw loaded module exports, including any named exports like lists */
	rawModuleExports?: unknown,
): string {
	const config = legacyConfig as {
		rules?: Record<string, unknown>;
		overrides?: unknown[];
	};

	// TypeScript mode uses `import type` and inline type annotations
	const typeImport = typescript ? `import type { Linter } from "eslint";\n\n` : "";
	const configType = typescript ? `: Linter.Config[]` : "";
	const jsdocType = typescript ? "" : `/** @type {import("eslint").Linter.Config[]} */\n`;

	const header = finalize
		? `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration.
 * Extend this in child package eslint.config.mts files to avoid duplicating common rules.
 * Named exports (e.g., importInternalModulesAllowed) can be imported and extended by consumers.
 */

${typeImport}`
		: `/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts${typescript ? " --typescript" : ""}
 *
 * Shared ESLint configuration.
 * Extend this in child package eslint.config.mts files to avoid duplicating common rules.
 * Named exports (e.g., importInternalModulesAllowed) can be imported and extended by consumers.
 */
${typeImport}`;

	let configContent = header;

	// Check if there are named exports (arrays) that should be exported for reuse
	// This preserves the pattern from .eslintrc.data.cjs where lists are exported
	// so other packages can reference and extend them
	const namedExports: Record<string, string[]> = {};
	if (rawModuleExports && typeof rawModuleExports === "object") {
		for (const [key, value] of Object.entries(rawModuleExports)) {
			// Export arrays that aren't the lintConfig itself
			if (
				key !== "lintConfig" &&
				Array.isArray(value) &&
				value.every((v) => typeof v === "string")
			) {
				namedExports[key] = value;
			}
		}
	}

	// Generate named exports for reusable lists
	for (const [name, value] of Object.entries(namedExports)) {
		const arrayType = typescript ? `: string[]` : "";
		configContent += `export const ${name}${arrayType} = ${serializeValue(value, "")};\n\n`;
	}

	// Helper to replace array values with variable references when they match named exports
	function replaceArraysWithRefs(obj: unknown): unknown {
		if (Array.isArray(obj)) {
			// Check if this array matches a named export
			for (const [name, exportedArray] of Object.entries(namedExports)) {
				if (
					obj.length === exportedArray.length &&
					obj.every((item, i) => item === exportedArray[i])
				) {
					// Return a marker that serializeValue will handle
					return `__VAR__${name}`;
				}
			}
			// Recursively process array elements
			return obj.map((item) => replaceArraysWithRefs(item));
		}
		if (obj && typeof obj === "object") {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				result[key] = replaceArraysWithRefs(value);
			}
			return result;
		}
		return obj;
	}

	// Process rules to replace array values with variable references
	const processedRules = config.rules ? replaceArraysWithRefs(config.rules) : undefined;
	const processedOverrides = config.overrides
		? (config.overrides as unknown[]).map((o) => replaceArraysWithRefs(o))
		: undefined;

	configContent += `${jsdocType}const config${configType} = [\n`;

	// Add rules
	if (processedRules && Object.keys(processedRules as object).length > 0) {
		configContent += `\t{\n\t\trules: ${serializeValue(processedRules, "\t\t")},\n\t},\n`;
	}

	// Add overrides
	if (processedOverrides && processedOverrides.length > 0) {
		for (const override of processedOverrides as Array<{
			files?: string | string[];
			excludedFiles?: string | string[];
			rules?: Record<string, unknown>;
		}>) {
			configContent += `\t{\n`;
			if (override.files) {
				configContent += `\t\tfiles: ${serializeValue(override.files, "\t\t")},\n`;
			}
			if (override.excludedFiles) {
				configContent += `\t\tignores: ${serializeValue(override.excludedFiles, "\t\t")},\n`;
			}
			if (override.rules) {
				configContent += `\t\trules: ${serializeValue(override.rules, "\t\t")},\n`;
			}
			configContent += `\t},\n`;
		}
	}

	configContent += `];\n\nexport default config;\n`;
	return configContent;
}

// List of TypeScript-ESLint rules that require type information
// These rules should not be applied to test files since the base config disables project for them
const TYPE_AWARE_RULES = new Set([
	"@typescript-eslint/await-thenable",
	"@typescript-eslint/consistent-return",
	"@typescript-eslint/consistent-type-exports",
	"@typescript-eslint/dot-notation",
	"@typescript-eslint/naming-convention",
	"@typescript-eslint/no-array-delete",
	"@typescript-eslint/no-base-to-string",
	"@typescript-eslint/no-confusing-void-expression",
	"@typescript-eslint/no-deprecated",
	"@typescript-eslint/no-duplicate-type-constituents",
	"@typescript-eslint/no-floating-promises",
	"@typescript-eslint/no-for-in-array",
	"@typescript-eslint/no-implied-eval",
	"@typescript-eslint/no-meaningless-void-operator",
	"@typescript-eslint/no-misused-promises",
	"@typescript-eslint/no-mixed-enums",
	"@typescript-eslint/no-redundant-type-constituents",
	"@typescript-eslint/no-unnecessary-boolean-literal-compare",
	"@typescript-eslint/no-unnecessary-condition",
	"@typescript-eslint/no-unnecessary-qualifier",
	"@typescript-eslint/no-unnecessary-template-expression",
	"@typescript-eslint/no-unnecessary-type-arguments",
	"@typescript-eslint/no-unnecessary-type-assertion",
	"@typescript-eslint/no-unnecessary-type-parameters",
	"@typescript-eslint/no-unsafe-argument",
	"@typescript-eslint/no-unsafe-assignment",
	"@typescript-eslint/no-unsafe-call",
	"@typescript-eslint/no-unsafe-enum-comparison",
	"@typescript-eslint/no-unsafe-member-access",
	"@typescript-eslint/no-unsafe-return",
	"@typescript-eslint/no-unsafe-type-assertion",
	"@typescript-eslint/no-unsafe-unary-minus",
	"@typescript-eslint/non-nullable-type-assertion-style",
	"@typescript-eslint/only-throw-error",
	"@typescript-eslint/prefer-destructuring",
	"@typescript-eslint/prefer-find",
	"@typescript-eslint/prefer-includes",
	"@typescript-eslint/prefer-nullish-coalescing",
	"@typescript-eslint/prefer-optional-chain",
	"@typescript-eslint/prefer-promise-reject-errors",
	"@typescript-eslint/prefer-readonly",
	"@typescript-eslint/prefer-readonly-parameter-types",
	"@typescript-eslint/prefer-reduce-type-parameter",
	"@typescript-eslint/prefer-regexp-exec",
	"@typescript-eslint/prefer-return-this-type",
	"@typescript-eslint/prefer-string-starts-ends-with",
	"@typescript-eslint/promise-function-async",
	"@typescript-eslint/related-getter-setter-pairs",
	"@typescript-eslint/require-array-sort-compare",
	"@typescript-eslint/require-await",
	"@typescript-eslint/restrict-plus-operands",
	"@typescript-eslint/restrict-template-expressions",
	"@typescript-eslint/return-await",
	"@typescript-eslint/strict-boolean-expressions",
	"@typescript-eslint/switch-exhaustiveness-check",
	"@typescript-eslint/unbound-method",
	"@typescript-eslint/use-unknown-in-catch-callback-variable",
]);

function buildFlatConfigContent(
	packageDir: string,
	variant: PackageTarget["flatVariant"],
	legacyConfig?: unknown,
	eslintIgnorePatterns?: string[],
	finalize: boolean = false,
	typescript: boolean = false,
	extendedLocalConfig?: { rules?: Record<string, unknown>; overrides?: unknown[] },
	sharedFlatConfigImport?: string,
	sharedConfigNamedImports?: string[],
	legacyConfigSource?: string,
	commentData?: CommentData,
	overrideCommentMap?: OverrideCommentMap,
): string {
	const flatSource = path
		.relative(
			packageDir,
			path.join(repoRoot, "common", "build", "eslint-config-fluid", "flat.mts"),
		)
		.replace(/\\/g, "/");
	const importPath = flatSource.startsWith(".") ? flatSource : `./${flatSource}`;

	// TypeScript mode uses `import type` and inline type annotations
	// JavaScript mode uses JSDoc comments for type annotations
	const typeImport = typescript ? `import type { Linter } from "eslint";\n` : "";
	const configType = typescript ? `: Linter.Config[]` : "";
	const jsdocType = typescript ? "" : `/** @type {import("eslint").Linter.Config[]} */\n`;

	// Build imports
	let imports = `${typeImport}import { ${variant} } from "${importPath}";\n`;
	if (sharedFlatConfigImport) {
		if (sharedConfigNamedImports && sharedConfigNamedImports.length > 0) {
			imports += `import sharedConfig, { ${sharedConfigNamedImports.join(", ")} } from "${sharedFlatConfigImport}";\n`;
		} else {
			imports += `import sharedConfig from "${sharedFlatConfigImport}";\n`;
		}
	}

	// In finalize mode, generate a clean config without the "GENERATED FILE" boilerplate
	const header = finalize
		? `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

${imports}
`
		: `/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts${typescriptMode ? " --typescript" : ""}
 */
${imports}
`;

	let configContent = header;

	// Parse source code to find concat patterns
	let concatPatterns = new Map<
		string,
		Array<{ varName: string; additionalItems: string[]; sourceIndex: number }>
	>();
	if (legacyConfigSource && sharedConfigNamedImports && sharedConfigNamedImports.length > 0) {
		concatPatterns = findConcatPatternsInSource(legacyConfigSource, sharedConfigNamedImports);

		// Process rules in the legacy config to apply concat patterns
		const processRules = (rules: Record<string, unknown>): Record<string, unknown> => {
			const result: Record<string, unknown> = {};
			for (const [ruleName, ruleConfig] of Object.entries(rules)) {
				result[ruleName] = processRuleConfigForConcat(ruleName, ruleConfig, concatPatterns);
			}
			return result;
		};

		// Process main rules
		if (legacyConfig?.rules) {
			(legacyConfig as any).rules = processRules(
				legacyConfig.rules as Record<string, unknown>,
			);
		}

		// Process override rules
		if (legacyConfig?.overrides && Array.isArray(legacyConfig.overrides)) {
			for (const override of legacyConfig.overrides as any[]) {
				if (override.rules) {
					override.rules = processRules(override.rules);
				}
			}
		}
	}

	// Check if there are local rules or overrides to include
	// If using a shared config, don't merge rules from extendedLocalConfig since they come from the shared config
	const mergedRules = sharedFlatConfigImport
		? { ...(legacyConfig?.rules ?? {}) }
		: {
				...(extendedLocalConfig?.rules ?? {}),
				...(legacyConfig?.rules ?? {}),
			};
	// Merge overrides from extended local config with direct overrides (unless using shared config)
	const mergedOverrides = sharedFlatConfigImport
		? [...(legacyConfig?.overrides ?? [])]
		: [...(extendedLocalConfig?.overrides ?? []), ...(legacyConfig?.overrides ?? [])];

	const hasLocalRules = Object.keys(mergedRules).length > 0;
	const hasOverrides = mergedOverrides.length > 0;
	const hasEslintIgnore = eslintIgnorePatterns && eslintIgnorePatterns.length > 0;

	// Check if there's a non-standard project configuration
	// projectService: true (from the shared flat config) handles automatic tsconfig discovery,
	// so most legacy parserOptions.project patterns are now unnecessary.
	// We only need to preserve truly non-standard patterns that projectService can't handle.
	let hasNonStandardProject = false;
	if (
		legacyConfig?.parserOptions?.project &&
		Array.isArray(legacyConfig.parserOptions.project)
	) {
		const projectPaths = legacyConfig.parserOptions.project;
		// Standard patterns that projectService handles automatically:
		// - ["./tsconfig.json", "./src/test/tsconfig.json"] - common dual-config pattern
		// - ["./tsconfig.json"] - single main config
		// - ["./tsconfig.eslint.json"] or similar single config variants
		// - ["./src/test/tsconfig.json"] - test-only config
		const isStandardPattern =
			// Two-config pattern: main + test
			(projectPaths.length === 2 &&
				projectPaths.includes("./tsconfig.json") &&
				projectPaths.includes("./src/test/tsconfig.json")) ||
			// Single config pattern (any single tsconfig file)
			projectPaths.length === 1;
		hasNonStandardProject = !isStandardPattern;
	}

	if (!hasLocalRules && !hasOverrides && !hasNonStandardProject && !hasEslintIgnore) {
		// Simple case: no local customizations
		const baseConfig = sharedFlatConfigImport
			? `...${variant}, ...sharedConfig`
			: `...${variant}`;
		configContent += `${jsdocType}const config${configType} = [${baseConfig}];\n`;

		// Add orphaned comments even in simple case
		const orphanedComments = commentData?.orphanedComments ?? [];
		if (orphanedComments.length > 0) {
			configContent += `\n/*\n * Comments from legacy config that couldn't be automatically migrated:\n`;
			for (const comment of orphanedComments) {
				if (comment.includes("\n")) {
					const lines = comment.split("\n");
					for (const line of lines) {
						configContent += ` * ${line}\n`;
					}
				} else {
					configContent += ` * ${comment}\n`;
				}
			}
			configContent += ` */\n`;
		}

		configContent += `\nexport default config;\n`;
	} else {
		// Complex case: include local rules/overrides/custom project config
		const reasons: string[] = [];
		if (hasLocalRules) reasons.push("local rules");
		if (hasOverrides) reasons.push("overrides");
		if (hasNonStandardProject) reasons.push("non-standard parserOptions.project");
		if (hasEslintIgnore) reasons.push("eslintignore patterns");
		console.log(`    Complex config: ${reasons.join(", ")}`);

		const baseConfig = sharedFlatConfigImport
			? `...${variant},\n\t...sharedConfig,\n`
			: `...${variant},\n`;
		configContent += `${jsdocType}const config${configType} = [\n\t${baseConfig}`;

		// Add .eslintignore patterns as global ignores FIRST for better organization
		// In flat config, a config object with only `ignores` is treated as global
		if (hasEslintIgnore) {
			configContent += `\t{\n`;
			configContent += `\t\tignores: ${serializeValue(eslintIgnorePatterns, "\t\t")},\n`;
			configContent += `\t},\n`;
		}

		if (hasLocalRules) {
			// Split rules into type-aware and non-type-aware
			// Type-aware rules that are disabled should be applied globally, not just to non-test files
			const typeAwareRules: Record<string, any> = {};
			const otherRules: Record<string, any> = {};
			// Rules for plugins configured via extends in the base config (react, react-hooks)
			// These need to be in a separate block scoped to the file types where the plugin is loaded
			const reactRules: Record<string, any> = {};

			for (const [ruleName, ruleConfig] of Object.entries(mergedRules)) {
				const isTypeAware = TYPE_AWARE_RULES.has(ruleName);
				const isDisabled =
					ruleConfig === "off" ||
					ruleConfig === 0 ||
					(Array.isArray(ruleConfig) && (ruleConfig[0] === "off" || ruleConfig[0] === 0));

				// React and react-hooks rules need to be in a block scoped to jsx/tsx files
				// where the plugin is loaded by the base config
				if (ruleName.startsWith("react/") || ruleName.startsWith("react-hooks/")) {
					reactRules[ruleName] = ruleConfig;
				} else if (isTypeAware && !isDisabled) {
					// Type-aware rules that are disabled should apply to all files
					// Type-aware rules that are enabled should only apply to non-test files
					typeAwareRules[ruleName] = ruleConfig;
				} else {
					otherRules[ruleName] = ruleConfig;
				}
			}

			// Add non-type-aware rules to all files
			if (Object.keys(otherRules).length > 0) {
				configContent += `\t{\n\t\trules: ${serializeRulesWithComments(otherRules, "\t\t", commentData, "rules")},\n\t},\n`;
			}

			// Add type-aware rules only to non-test files
			if (Object.keys(typeAwareRules).length > 0) {
				configContent += `\t{\n\t\tfiles: ["**/*.{ts,tsx}"],\n\t\tignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],\n\t\trules: ${serializeRulesWithComments(typeAwareRules, "\t\t", commentData, "rules")},\n\t},\n`;
			}

			// Add react/react-hooks rules scoped to jsx/tsx files where the plugin is loaded
			// The base config (minimal-deprecated.js) loads react and react-hooks plugins for *.jsx and *.tsx files
			if (Object.keys(reactRules).length > 0) {
				configContent += `\t{\n\t\tfiles: ["**/*.jsx", "**/*.tsx"],\n\t\trules: ${serializeRulesWithComments(reactRules, "\t\t", commentData, "rules")},\n\t},\n`;
			}
		}

		// Track if any override already handles parserOptions for test files
		let overrideHandlesTestParserOptions = false;

		if (hasOverrides) {
			let overrideIndex = 0;
			for (const override of mergedOverrides as Array<{
				files?: string | string[];
				excludedFiles?: string | string[];
				parserOptions?: { project?: string[] };
				rules?: Record<string, unknown>;
			}>) {
				// Skip empty overrides (those with only files but no rules or other config)
				const hasRules = override.rules && Object.keys(override.rules).length > 0;
				const hasParserOptions = override.parserOptions?.project;
				const hasIgnores = override.excludedFiles;
				if (!hasRules && !hasParserOptions && !hasIgnores) {
					continue;
				}

				configContent += `\t{\n`;
				if (override.files) {
					configContent += `\t\tfiles: ${serializeValue(override.files, "\t\t")},\n`;
				}
				if (override.excludedFiles) {
					configContent += `\t\tignores: ${serializeValue(override.excludedFiles, "\t\t")},\n`;
				}
				// Handle parserOptions.project in overrides - only for non-standard patterns
				// projectService: true handles most tsconfig discovery automatically
				if (override.parserOptions?.project) {
					const overrideProjectPaths = Array.isArray(override.parserOptions.project)
						? override.parserOptions.project
						: [override.parserOptions.project];
					// Standard patterns that projectService handles automatically
					const isStandardOverridePattern =
						// Two-config pattern: main + test
						(overrideProjectPaths.length === 2 &&
							overrideProjectPaths.includes("./tsconfig.json") &&
							overrideProjectPaths.includes("./src/test/tsconfig.json")) ||
						// Single config pattern (any single tsconfig file)
						overrideProjectPaths.length === 1;

					if (!isStandardOverridePattern) {
						console.log(
							`    Override explicit parserOptions.project: ${JSON.stringify(overrideProjectPaths)}`,
						);
						configContent += `\t\tlanguageOptions: {\n`;
						configContent += `\t\t\tparserOptions: {\n`;
						configContent += `\t\t\t\tprojectService: false,\n`;
						configContent += `\t\t\t\tproject: ${serializeValue(override.parserOptions.project, "\t\t\t\t")},\n`;
						configContent += `\t\t\t},\n`;
						configContent += `\t\t},\n`;
					}
					// Check if this override targets test files
					const files = Array.isArray(override.files) ? override.files : [override.files];
					if (files.some((f: string) => f.includes("test") || f.includes("spec"))) {
						overrideHandlesTestParserOptions = true;
					}
				}
				if (override.rules) {
					const overrideContextPrefix = `overrides[${overrideIndex}].rules`;
					configContent += `\t\trules: ${serializeRulesWithComments(override.rules as Record<string, unknown>, "\t\t", commentData, overrideContextPrefix)},\n`;
				}
				configContent += `\t},\n`;
				overrideIndex++;
			}
		}

		// Add parserOptions.project configuration only if it's non-standard
		// projectService: true (from the shared flat config) handles automatic tsconfig discovery,
		// so most legacy parserOptions.project patterns are now unnecessary.
		// Skip if an override already handles test file parserOptions
		if (
			!overrideHandlesTestParserOptions &&
			legacyConfig?.parserOptions?.project &&
			Array.isArray(legacyConfig.parserOptions.project)
		) {
			const projectPaths = legacyConfig.parserOptions.project;
			// Standard patterns that projectService handles automatically:
			// - ["./tsconfig.json", "./src/test/tsconfig.json"] - common dual-config pattern
			// - ["./tsconfig.json"] - single main config
			// - ["./tsconfig.eslint.json"] or similar single config variants
			// - ["./src/test/tsconfig.json"] - test-only config
			const isStandardPattern =
				// Two-config pattern: main + test
				(projectPaths.length === 2 &&
					projectPaths.includes("./tsconfig.json") &&
					projectPaths.includes("./src/test/tsconfig.json")) ||
				// Single config pattern (any single tsconfig file)
				projectPaths.length === 1;

			if (!isStandardPattern) {
				// When parserOptions.project is at the top level in the legacy config,
				// it applies to ALL files, not just test files. We need to apply it
				// to all TypeScript files to override the shared config's projectService.
				console.log(`    Explicit parserOptions.project: ${JSON.stringify(projectPaths)}`);
				configContent += `\t{\n`;
				configContent += `\t\tfiles: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],\n`;
				configContent += `\t\tlanguageOptions: {\n`;
				configContent += `\t\t\tparserOptions: {\n`;
				configContent += `\t\t\t\tprojectService: false,\n`;
				configContent += `\t\t\t\tproject: ${serializeValue(projectPaths, "\t\t\t\t")},\n`;
				configContent += `\t\t\t},\n`;
				configContent += `\t\t},\n`;
				configContent += `\t},\n`;
			}
		}

		configContent += `];\n\nexport default config;\n`;
	}
	return configContent;
}

async function writeSharedConfigs(
	sharedConfigs: SharedConfigTarget[],
	finalize: boolean,
	typescript: boolean,
): Promise<void> {
	if (sharedConfigs.length === 0) return;

	const ext = typescript ? "mts" : "mjs";
	console.log(`\nGenerating ${sharedConfigs.length} shared flat config file(s) (.${ext})...`);
	for (const shared of sharedConfigs) {
		const content = buildSharedConfigContent(
			path.dirname(shared.outputPath),
			shared.legacyConfig,
			finalize,
			typescript,
			shared.rawModuleExports,
		);
		await fs.writeFile(shared.outputPath, content, "utf8");
		console.log(`  Generated: ${path.relative(repoRoot, shared.outputPath)}`);
	}
}

async function writeFlatConfigs(
	targets: PackageTarget[],
	finalize: boolean,
	typescript: boolean,
): Promise<void> {
	const mode = finalize ? "Finalizing" : "Generating";
	const ext = typescript ? "mts" : "mjs";
	console.log(`\n${mode} ${targets.length} flat config files (.${ext})...`);
	for (const t of targets) {
		const outPath = path.join(t.packageDir, `eslint.config.${ext}`);
		// Always overwrite if legacy config exists (we only process dirs with .eslintrc.cjs)
		const content = buildFlatConfigContent(
			t.packageDir,
			t.flatVariant,
			t.legacyConfig,
			t.eslintIgnorePatterns,
			finalize,
			typescript,
			t.extendedLocalConfig,
			t.sharedFlatConfigImport,
			t.sharedConfigNamedImports,
			t.legacyConfigSource,
			t.commentData,
			t.overrideCommentMap,
		);
		await fs.writeFile(outPath, content, "utf8");
		console.log(`  Generated: ${path.relative(repoRoot, outPath)} (${t.flatVariant})`);

		// In finalize mode, delete the legacy config files
		if (finalize) {
			// Delete .eslintrc.cjs
			try {
				await fs.unlink(t.legacyConfigPath);
				console.log(`    Deleted: ${path.relative(repoRoot, t.legacyConfigPath)}`);
			} catch (e) {
				console.error(`    Failed to delete ${t.legacyConfigPath}:`, e);
			}

			// Delete .eslintignore if it existed
			if (t.eslintIgnorePatterns && t.eslintIgnorePatterns.length > 0) {
				const eslintIgnorePath = path.join(t.packageDir, ".eslintignore");
				try {
					await fs.unlink(eslintIgnorePath);
					console.log(`    Deleted: ${path.relative(repoRoot, eslintIgnorePath)}`);
				} catch (e) {
					console.error(`    Failed to delete ${eslintIgnorePath}:`, e);
				}
			}
		}
	}
}

async function main() {
	if (finalizeMode) {
		console.log("Running in FINALIZE mode - will delete legacy configs after generation.\n");
	}
	if (typescriptMode) {
		// See: https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files
		console.log("Running in TYPESCRIPT mode - generating .mts files (requires jiti).\n");
	}

	const sharedConfigs = await findSharedConfigs();
	const targets = await findLegacyConfigs(sharedConfigs);

	await writeSharedConfigs(sharedConfigs, finalizeMode, typescriptMode);
	await writeFlatConfigs(targets, finalizeMode, typescriptMode);

	const ext = typescriptMode ? ".mts" : ".mjs";
	if (finalizeMode) {
		console.log(
			`\nFinalized ${targets.length} flat config files (${ext}) and deleted legacy .eslintrc.cjs configs.`,
		);
	} else {
		console.log(
			`Generated ${sharedConfigs.length} shared config(s) and ${targets.length} flat config files (${ext}) from legacy .eslintrc.cjs configs.`,
		);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
