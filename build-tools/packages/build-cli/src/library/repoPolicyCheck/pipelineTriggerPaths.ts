/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";

import { type Handler, readFile, writeFile } from "./common.js";

/**
 * Verifies that every YAML template transitively included by a top-level ADO pipeline
 * is covered by that pipeline's `trigger.paths.include` and `pr.paths.include` filters.
 *
 * If a pipeline includes a template (directly or via another template) whose path is not
 * matched by the trigger path filters, edits to that template will not trigger the pipeline.
 *
 * Scope:
 * - Only matches top-level `*.yml` files directly under `tools/pipelines/`.
 * - Follows `template:` references targeting the same repo (`@self` or no resource alias).
 * - Skips templates from other repository resources (e.g. `@m365Pipelines`).
 * - Treats `trigger: none` / `pr: none` as an explicit opt-out and does not flag those.
 * - Treats a `trigger:`/`pr:` block that has `branches:` but no `paths:` as already covering
 * every path (no path filter), so does not flag those.
 *
 * The resolver fixes coverage gaps in two ways:
 * - Inserts missing entries into existing `paths.include` lists at the lexicographically
 * correct position relative to surrounding entries.
 * - Adds a missing `trigger:` or `pr:` block (with both `branches:` and `paths:`) when the
 * file uses templates but lacks the section. Branches are copied from the sibling block
 * when present, otherwise default to `main, next, lts, release/*`.
 */
export const handler: Handler = {
	name: "pipeline-trigger-paths",
	match: /^tools\/pipelines\/[^/]+\.yml$/i,
	handler: async (file: string, root: string): Promise<string | undefined> => {
		const issues = analyzePipeline(file, root).issues;
		return issues.length === 0 ? undefined : issues.join("\n");
	},
	resolver: (file: string, root: string): { resolved: boolean; message?: string } => {
		const analysis = analyzePipeline(file, root);
		if (analysis.issues.length === 0) {
			return { resolved: true };
		}
		try {
			const newContent = applyFixes(readFile(file), analysis);
			writeFile(file, newContent);
			return { resolved: true };
		} catch (err) {
			return {
				resolved: false,
				message: `Could not auto-fix: ${(err as Error).message}`,
			};
		}
	},
};

// =====================================================================================
// Parsing
// =====================================================================================

const TEMPLATE_REF_REGEX = /^\s*-?\s*template:\s*(.+?)\s*$/;

/** Half-open line range [start, end). */
interface LineRange {
	start: number;
	end: number;
}

/**
 * Information about a `paths.include` list: its existing items and the lines they occupy.
 */
interface PathsIncludeInfo {
	/** Existing items in file order. */
	items: string[];
	/** Indent (in spaces) used by each `- item` line. */
	itemIndent: number;
	/**
	 * Half-open line range covering the items themselves (does not include the
	 * `include:` line nor any trailing line outside the list).
	 */
	itemRange: LineRange;
	/**
	 * Line number of the `include:` line (zero-indexed).
	 */
	includeLine: number;
}

type BlockShape =
	| { kind: "missing" }
	| { kind: "none"; keyLine: number }
	/** `<key>:` block exists but uses no `paths:` filter (all paths trigger). */
	| { kind: "branchesOnly"; keyLine: number; blockRange: LineRange }
	/** `<key>:` block has a `paths.include:` we can read and modify. */
	| {
			kind: "include";
			keyLine: number;
			blockRange: LineRange;
			paths: PathsIncludeInfo;
	  };

function getIndent(line: string): number {
	let i = 0;
	while (i < line.length && line[i] === " ") i++;
	return i;
}

function stripQuotes(s: string): string {
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	return s;
}

function findInlineCommentIndex(s: string): number {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === "#" && !inSingle && !inDouble) {
			if (i === 0 || s[i - 1] === " " || s[i - 1] === "\t") return i;
		}
	}
	return -1;
}

function stripInlineComment(s: string): string {
	const i = findInlineCommentIndex(s);
	return (i >= 0 ? s.slice(0, i) : s).trimEnd();
}

/**
 * Find a top-level `<key>:` block in a YAML file and extract its shape.
 * Relies on the consistent 2-space indentation used across this repo's pipeline files.
 */
export function findTopLevelBlock(content: string, key: "pr" | "trigger"): BlockShape {
	const lines = content.split(/\r?\n/);
	let keyLine = -1;
	let blockEnd = lines.length;
	let isNone = false;

	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const trimmed = ln.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		if (getIndent(ln) !== 0) continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx < 0) continue;
		const k = trimmed.slice(0, colonIdx);
		if (keyLine === -1) {
			if (k === key) {
				keyLine = i;
				const rest = stripInlineComment(trimmed.slice(colonIdx + 1)).trim();
				if (rest === "none") {
					isNone = true;
				}
			}
			continue;
		}
		// We've already found the key line. The next col-0 key line ends the block.
		blockEnd = i;
		break;
	}

	if (keyLine === -1) return { kind: "missing" };
	if (isNone) return { kind: "none", keyLine };

	// Find paths.include within the block.
	const blockRange: LineRange = { start: keyLine, end: blockEnd };
	let pathsIncludeLine = -1;
	for (let i = keyLine + 1; i < blockEnd; i++) {
		const ln = lines[i];
		const trimmed = ln.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const indent = getIndent(ln);
		if (indent === 2) {
			if (trimmed === "paths:") {
				// Find `include:` under it.
				for (let j = i + 1; j < blockEnd; j++) {
					const ln2 = lines[j];
					const t2 = ln2.trim();
					if (t2 === "" || t2.startsWith("#")) continue;
					const ind = getIndent(ln2);
					if (ind <= 2) break;
					if (ind === 4 && t2 === "include:") {
						pathsIncludeLine = j;
						break;
					}
				}
			}
		}
	}

	if (pathsIncludeLine === -1) {
		return { kind: "branchesOnly", keyLine, blockRange };
	}

	// Collect items under include:.
	const items: string[] = [];
	let itemStart = -1;
	let itemEnd = pathsIncludeLine + 1;
	let itemIndent = 4;
	for (let j = pathsIncludeLine + 1; j < blockEnd; j++) {
		const ln = lines[j];
		const trimmed = ln.trim();
		if (trimmed === "") {
			itemEnd = j + 1;
			continue;
		}
		if (trimmed.startsWith("#")) {
			itemEnd = j + 1;
			continue;
		}
		const indent = getIndent(ln);
		if (indent < 4) break;
		if (indent === 4 && trimmed.startsWith("- ")) {
			if (itemStart === -1) itemStart = j;
			itemIndent = indent;
			let v = trimmed.slice(2).trim();
			v = stripInlineComment(v).trim();
			v = stripQuotes(v);
			if (v.length > 0) items.push(v);
			itemEnd = j + 1;
		} else if (indent > 4) {
			// Continuation (e.g. multi-line value) — unusual here. Treat as part of the list.
			itemEnd = j + 1;
		} else {
			break;
		}
	}

	if (itemStart === -1) {
		// Empty include list. Place items right after `include:`.
		itemStart = pathsIncludeLine + 1;
		itemEnd = pathsIncludeLine + 1;
	}

	return {
		kind: "include",
		keyLine,
		blockRange,
		paths: {
			items,
			itemIndent,
			itemRange: { start: itemStart, end: itemEnd },
			includeLine: pathsIncludeLine,
		},
	};
}

/**
 * BFS over `template:` references reachable from `rootFile`. Follows only same-repo
 * references (`@self` or no resource suffix).
 *
 * Returns a map from each reachable file's absolute path to the absolute path of the
 * file that first introduced it (its parent in the BFS tree). The root file maps to
 * `undefined`. The map encodes the shortest inclusion chain to each template, which
 * callers can reconstruct by walking parent pointers.
 *
 * Templates whose paths cannot be resolved (e.g. `${{ ... }}` interpolation, missing
 * files) are reported in `unresolved` as human-readable strings.
 */
export function findIncludedTemplates(
	rootFile: string,
	repoRoot: string,
): { parents: Map<string, string | undefined>; unresolved: Set<string> } {
	const rootAbs = path.resolve(rootFile);
	const parents = new Map<string, string | undefined>();
	parents.set(rootAbs, undefined);
	const unresolved = new Set<string>();
	const visited = new Set<string>();
	const queue: string[] = [rootAbs];

	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (visited.has(file)) continue;
		visited.add(file);

		let content: string;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch (err) {
			unresolved.add(
				`Could not read ${path.relative(repoRoot, file)}: ${(err as Error).message}`,
			);
			continue;
		}

		for (const rawLine of content.split(/\r?\n/)) {
			if (rawLine.trim().startsWith("#")) continue;
			const line = stripInlineComment(rawLine);
			const m = TEMPLATE_REF_REGEX.exec(line);
			if (m === null) continue;
			const value = stripQuotes(m[1].trim());

			if (value.includes("${{")) {
				unresolved.add(
					`'${value}' (variable interpolation in ${path.relative(repoRoot, file)})`,
				);
				continue;
			}

			const atIdx = value.lastIndexOf("@");
			const templatePath = atIdx >= 0 ? value.slice(0, atIdx) : value;
			const resource = atIdx >= 0 ? value.slice(atIdx + 1) : "self";
			if (resource !== "self") continue;

			const absPath = templatePath.startsWith("/")
				? path.join(repoRoot, templatePath)
				: path.resolve(path.dirname(file), templatePath);

			if (!fs.existsSync(absPath)) {
				unresolved.add(
					`'${value}' → '${path.relative(repoRoot, absPath)}' (referenced from '${path.relative(repoRoot, file)}', file not found)`,
				);
				continue;
			}

			const norm = path.resolve(absPath);
			// First-seen wins: BFS guarantees this is a shortest chain to `norm`.
			if (!parents.has(norm)) parents.set(norm, file);
			if (!visited.has(norm)) queue.push(norm);
		}
	}

	return { parents, unresolved };
}

/**
 * Walks parent pointers from `target` up to the root, returning the inclusion chain
 * as a list of basenames in root-to-leaf order.
 */
function chainBasenames(target: string, parents: Map<string, string | undefined>): string[] {
	const chain: string[] = [];
	let cur: string | undefined = target;
	while (cur !== undefined) {
		chain.unshift(path.basename(cur));
		cur = parents.get(cur);
	}
	return chain;
}

// =====================================================================================
// Coverage check
// =====================================================================================

/**
 * Returns true if `pattern` from a `paths.include` filter covers `filePath`. ADO path
 * filters are essentially path prefixes with two glob shorthands:
 * - `dir/*`  matches files directly under `dir`.
 * - `dir/**` matches everything under `dir`, recursively.
 * - Otherwise the pattern matches the exact path or anything under it.
 */
export function pathMatchesPattern(filePath: string, pattern: string): boolean {
	const f = filePath.replace(/^\/+/, "");
	const p = pattern.replace(/^\/+/, "");

	if (p.endsWith("/**")) {
		const base = p.slice(0, -3);
		return f === base || f.startsWith(`${base}/`);
	}
	if (p.endsWith("/*")) {
		const base = p.slice(0, -2);
		if (!f.startsWith(`${base}/`)) return false;
		return !f.slice(base.length + 1).includes("/");
	}
	return f === p || f.startsWith(`${p}/`);
}

function isCovered(filePath: string, patterns: string[]): boolean {
	return patterns.some((p) => pathMatchesPattern(filePath, p));
}

// =====================================================================================
// Analysis
// =====================================================================================

interface Analysis {
	/** Repo-relative paths that should be covered by trigger filters. */
	requiredPaths: string[];
	/** State of the `trigger:` block. */
	trigger: BlockShape;
	/** State of the `pr:` block. */
	pr: BlockShape;
	/** Human-readable issue messages — empty if there are no issues. */
	issues: string[];
}

function toRepoRelative(absolute: string, repoRoot: string): string {
	return path.relative(repoRoot, absolute).replaceAll(path.sep, "/");
}

export function analyzePipeline(file: string, repoRoot: string): Analysis {
	const content = readFile(file);
	const trigger = findTopLevelBlock(content, "trigger");
	const pr = findTopLevelBlock(content, "pr");

	const { parents, unresolved } = findIncludedTemplates(file, repoRoot);
	// `findIncludedTemplates` already records the pipeline file itself as a root, so
	// `parents.keys()` contains every file that should be covered by the trigger paths.

	const absPaths = [...parents.keys()];
	const relByAbs = new Map<string, string>(
		absPaths.map((abs) => [abs, toRepoRelative(abs, repoRoot)]),
	);
	const absByRel = new Map<string, string>(
		[...relByAbs.entries()].map(([abs, rel]) => [rel, abs]),
	);
	const requiredPaths = [...relByAbs.values()].sort();

	const issues: string[] = [];
	// Templates beyond the pipeline file itself were referenced.
	const usesTemplates = parents.size > 1;

	const formatChain = (relPath: string): string => {
		const abs = absByRel.get(relPath);
		if (abs === undefined) return relPath;
		return chainBasenames(abs, parents).join(" → ");
	};

	for (const [key, block] of [
		["trigger", trigger],
		["pr", pr],
	] as const) {
		if (!usesTemplates) continue;
		switch (block.kind) {
			case "missing":
				issues.push(`Missing top-level '${key}:' section.`);
				break;
			case "none":
			case "branchesOnly":
				break;
			case "include": {
				const missing = requiredPaths.filter((f) => !isCovered(f, block.paths.items));
				if (missing.length > 0) {
					issues.push(
						`'${key}.paths.include' is missing entries (shown as inclusion chain → missing template):\n${missing
							.map((m) => `  - ${formatChain(m)}`)
							.join("\n")}`,
					);
				}
				break;
			}
			default:
				assertNever(block);
		}
	}

	if (unresolved.size > 0) {
		issues.push(
			`Unresolved template references:\n${[...unresolved]
				.sort()
				.map((u) => `  - ${u}`)
				.join("\n")}`,
		);
	}

	return { requiredPaths, trigger, pr, issues };
}

function assertNever(x: never): never {
	throw new Error(`Unexpected case: ${JSON.stringify(x)}`);
}

// =====================================================================================
// Resolver / fixer
// =====================================================================================

const DEFAULT_BRANCHES = ["main", "next", "lts", "release/*"];

/**
 * Insert `newItems` into `existingItems` such that each new item lands at the position
 * where it fits lexicographically (before the first existing item that is strictly
 * greater). Existing items are not reordered.
 */
export function insertLexicographically(
	existingItems: readonly string[],
	newItems: readonly string[],
): string[] {
	const result = [...existingItems];
	for (const newItem of [...newItems].sort()) {
		let insertIdx = result.length;
		for (let i = 0; i < result.length; i++) {
			if (newItem < result[i]) {
				insertIdx = i;
				break;
			}
		}
		result.splice(insertIdx, 0, newItem);
	}
	return result;
}

/**
 * Given the file content and the analysis, produce a new content string with every
 * detected issue resolved.
 */
export function applyFixes(content: string, analysis: Analysis): string {
	let lines = content.split(/\r?\n/);
	const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";

	// Re-find blocks each time we mutate, since line numbers shift.
	const apply = (key: "trigger" | "pr"): void => {
		const current = findTopLevelBlock(lines.join(lineEnding), key);
		switch (current.kind) {
			case "missing":
				lines = insertNewBlock(lines, key, analysis);
				break;
			case "none":
			case "branchesOnly":
				break;
			case "include": {
				const missing = analysis.requiredPaths.filter(
					(f) => !isCovered(f, current.paths.items),
				);
				if (missing.length > 0) {
					lines = insertMissingItems(lines, current, missing);
				}
				break;
			}
			default:
				assertNever(current);
		}
	};

	apply("trigger");
	apply("pr");

	return lines.join(lineEnding);
}

/** Insert `missing` into the include list represented by `block.paths`. */
function insertMissingItems(
	lines: string[],
	block: Extract<BlockShape, { kind: "include" }>,
	missing: string[],
): string[] {
	const itemIndentStr = " ".repeat(block.paths.itemIndent);
	const merged = insertLexicographically(block.paths.items, missing);
	const missingSet = new Set(missing);

	// Walk through the merged list in order. For each new item, insert it on the line
	// right after the previous merged item (existing or already-inserted). For each
	// existing item, locate its current line in the (mutated) result so subsequent
	// new items anchor against the correct position.
	const result = lines.slice();
	// Anchor — the line of the most-recently processed merged item. New items are
	// inserted on the line immediately after this. Initialised to the `include:` line
	// so that an item that comes before every existing entry lands right under it.
	let anchorLine = block.paths.includeLine;
	let totalInserted = 0;

	for (const item of merged) {
		if (missingSet.has(item)) {
			const insertAt = anchorLine + 1;
			result.splice(insertAt, 0, `${itemIndentStr}- ${item}`);
			anchorLine = insertAt;
			totalInserted += 1;
		} else {
			const found = findItemLine(
				result,
				block.paths.itemRange.start,
				block.paths.itemRange.end + totalInserted,
				item,
				block.paths.itemIndent,
			);
			if (found >= 0) anchorLine = found;
		}
	}

	return result;
}

function findItemLine(
	lines: string[],
	start: number,
	end: number,
	value: string,
	itemIndent: number,
): number {
	const prefix = `${" ".repeat(itemIndent)}- `;
	for (let i = start; i < end && i < lines.length; i++) {
		const ln = lines[i];
		if (!ln.startsWith(prefix)) continue;
		let v = ln.slice(prefix.length).trim();
		v = stripInlineComment(v).trim();
		v = stripQuotes(v);
		if (v === value) return i;
	}
	return -1;
}

/**
 * Insert a new top-level `trigger:` or `pr:` block into `lines`. Branches are copied
 * from the sibling block when available, otherwise default to `main, next, lts, release/*`.
 */
function insertNewBlock(lines: string[], key: "trigger" | "pr", analysis: Analysis): string[] {
	const sibling = key === "trigger" ? analysis.pr : analysis.trigger;
	const branches = extractBranchesFromSibling(lines, sibling) ?? DEFAULT_BRANCHES;

	const newBlockLines = renderTriggerBlock(key, branches, analysis.requiredPaths);

	// Find the insertion line.
	const insertLine = decideInsertionLine(lines, key, sibling);

	const result = lines.slice();
	const sep = result[insertLine - 1] === "" ? [] : [""];
	result.splice(insertLine, 0, ...sep, ...newBlockLines, "");
	return result;
}

/**
 * Return the branches list of the sibling block if we can extract it cleanly.
 */
function extractBranchesFromSibling(
	lines: string[],
	sibling: BlockShape,
): string[] | undefined {
	if (sibling.kind === "missing" || sibling.kind === "none") return undefined;
	const range = sibling.blockRange;
	let inBranches = false;
	let inInclude = false;
	const branches: string[] = [];
	for (let i = range.start + 1; i < range.end; i++) {
		const ln = lines[i];
		const trimmed = ln.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const indent = getIndent(ln);
		if (!inBranches) {
			if (indent === 2 && trimmed === "branches:") inBranches = true;
			continue;
		}
		if (!inInclude) {
			if (indent === 4 && trimmed === "include:") inInclude = true;
			else if (indent <= 2) break;
			continue;
		}
		if (indent < 4) break;
		if (indent === 4 && trimmed.startsWith("- ")) {
			let v = trimmed.slice(2).trim();
			v = stripInlineComment(v).trim();
			v = stripQuotes(v);
			if (v.length > 0) branches.push(v);
		}
	}
	return branches.length > 0 ? branches : undefined;
}

function renderTriggerBlock(
	key: "trigger" | "pr",
	branches: readonly string[],
	paths: readonly string[],
): string[] {
	const out: string[] = [];
	out.push(`${key}:`);
	out.push("  branches:");
	out.push("    include:");
	for (const b of branches) out.push(`    - ${b}`);
	out.push("  paths:");
	out.push("    include:");
	for (const p of [...paths].sort()) out.push(`    - ${p}`);
	return out;
}

/**
 * Choose where to insert a new top-level block. Preferred placement:
 * - If sibling exists, place adjacent to it (trigger before pr; pr after trigger).
 * - Otherwise, place before the first occurrence of any of {variables, resources, extends, stages, jobs}.
 * - If none of those exist either, append at end of file.
 */
function decideInsertionLine(
	lines: string[],
	key: "trigger" | "pr",
	sibling: BlockShape,
): number {
	if (sibling.kind !== "missing") {
		const range = sibling as Exclude<BlockShape, { kind: "missing" }>;
		// `none` doesn't carry a blockRange, just keyLine.
		if (sibling.kind === "none") {
			return key === "trigger" ? sibling.keyLine : sibling.keyLine + 1;
		}
		const blockRange = (range as { blockRange: LineRange }).blockRange;
		return key === "trigger" ? blockRange.start : blockRange.end;
	}

	const sectionKeys = new Set(["variables", "resources", "extends", "stages", "jobs"]);
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		if (getIndent(ln) !== 0) continue;
		const trimmed = ln.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx < 0) continue;
		const k = trimmed.slice(0, colonIdx);
		if (sectionKeys.has(k)) return i;
	}
	return lines.length;
}
