/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import createIgnore from "ignore";
import { glob as tinyglobbyGlob } from "tinyglobby";

/**
 * Converts a path to use forward slashes (POSIX style).
 */
export function toPosixPath(s: string): string {
	return s.replace(/\\/g, "/");
}

/**
 * A gitignore rule set binds a directory to an `ignore` instance configured
 * with the patterns from that directory's .gitignore file.
 */
type GitignoreRuleSet = {
	dir: string;
	ig: ReturnType<typeof createIgnore>;
};

/**
 * Cache for gitignore rule sets per directory path.
 *
 * This avoids re-reading .gitignore files for the same directory.
 * Note: This cache is scoped to the module lifecycle. If .gitignore files
 * are modified while a process is running, the cached patterns may become
 * stale. Long-running processes that need to reflect .gitignore changes
 * should call {@link clearGitignoreRuleSetsCache} when appropriate.
 */
const gitignoreRuleSetsCache = new Map<string, GitignoreRuleSet[]>();

/**
 * Clears the cached gitignore rule sets.
 *
 * This can be used by long-running processes (e.g. watch modes) that need to
 * pick up changes to .gitignore files without restarting the process.
 */
export function clearGitignoreRuleSetsCache(): void {
	gitignoreRuleSetsCache.clear();
}

/**
 * Reads gitignore patterns from .gitignore files in the given directory and its
 * parents, returning a list of rule sets ordered from ancestor to descendant.
 * Results are cached per directory path to avoid repeated filesystem reads.
 */
async function readGitignoreRuleSets(dir: string): Promise<GitignoreRuleSet[]> {
	// Check cache first
	const cached = gitignoreRuleSetsCache.get(dir);
	if (cached !== undefined) {
		return cached;
	}

	const ruleSets: GitignoreRuleSet[] = [];
	const dirs: string[] = [];

	// Collect directory chain from dir up to filesystem root
	let currentDir = dir;
	while (true) {
		dirs.push(currentDir);
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	// Walk from the highest ancestor down to the provided dir
	for (const directory of dirs.reverse()) {
		const gitignorePath = path.join(directory, ".gitignore");
		if (!existsSync(gitignorePath)) {
			continue;
		}

		try {
			const content = await readFile(gitignorePath, "utf8");
			// Parse gitignore content - each non-empty, non-comment line is a pattern
			const filePatterns = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));

			if (filePatterns.length > 0) {
				const ig = createIgnore();
				ig.add(filePatterns);
				ruleSets.push({ dir: directory, ig });
			}
		} catch {
			// Ignore errors reading .gitignore files
		}
	}

	// Cache the result
	gitignoreRuleSetsCache.set(dir, ruleSets);
	return ruleSets;
}

/**
 * Reads gitignore patterns from .gitignore files in the given directory and its
 * parents synchronously, returning a list of rule sets ordered from ancestor to descendant.
 * Results are cached per directory path to avoid repeated filesystem reads.
 *
 * Because of this caching, changes to `.gitignore` files made after the first read
 * for a given directory will not be reflected until the process is restarted.
 */
function readGitignoreRuleSetsSync(dir: string): GitignoreRuleSet[] {
	// Check cache first
	const cached = gitignoreRuleSetsCache.get(dir);
	if (cached !== undefined) {
		return cached;
	}

	const ruleSets: GitignoreRuleSet[] = [];
	const dirs: string[] = [];

	// Collect directory chain from dir up to filesystem root
	let currentDir = dir;
	while (true) {
		dirs.push(currentDir);
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	// Walk from the highest ancestor down to the provided dir
	for (const directory of dirs.reverse()) {
		const gitignorePath = path.join(directory, ".gitignore");
		if (!existsSync(gitignorePath)) {
			continue;
		}

		try {
			const content = readFileSync(gitignorePath, "utf8");
			// Parse gitignore content - each non-empty, non-comment line is a pattern
			const filePatterns = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));

			if (filePatterns.length > 0) {
				const ig = createIgnore();
				ig.add(filePatterns);
				ruleSets.push({ dir: directory, ig });
			}
		} catch {
			// Ignore errors reading .gitignore files
		}
	}

	// Cache the result
	gitignoreRuleSetsCache.set(dir, ruleSets);
	return ruleSets;
}

/**
 * Filters an array of absolute file paths using gitignore rules.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 */
export async function filterByGitignore(
	files: string[],
	cwd: string,
): Promise<string[]> {
	// Read .gitignore rule sets for the cwd and its parent directories
	const ruleSets = await readGitignoreRuleSets(cwd);
	if (ruleSets.length === 0) {
		return files;
	}

	return filterFilesWithRuleSets(files, cwd, ruleSets);
}

/**
 * Filters an array of absolute file paths using gitignore rules synchronously.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 */
export function filterByGitignoreSync(files: string[], cwd: string): string[] {
	// Read .gitignore rule sets for the cwd and its parent directories
	const ruleSets = readGitignoreRuleSetsSync(cwd);
	if (ruleSets.length === 0) {
		return files;
	}

	return filterFilesWithRuleSets(files, cwd, ruleSets);
}

/**
 * Internal helper to filter files using pre-loaded rule sets.
 */
function filterFilesWithRuleSets(
	files: string[],
	cwd: string,
	ruleSets: GitignoreRuleSet[],
): string[] {
	return files.filter((file) => {
		const relativeToCwd = path.relative(cwd, file);
		// Only filter files that are within the cwd
		if (relativeToCwd.startsWith("..") || path.isAbsolute(relativeToCwd)) {
			return true;
		}

		const absoluteFilePath = path.resolve(file);
		let isIgnored = false;

		for (const { dir, ig } of ruleSets) {
			const relativeToRuleDir = path.relative(dir, absoluteFilePath);
			// Skip rule sets whose directory does not contain this file
			if (relativeToRuleDir.startsWith("..") || path.isAbsolute(relativeToRuleDir)) {
				continue;
			}

			const testResult = ig.test(toPosixPath(relativeToRuleDir));
			if (testResult.ignored) {
				isIgnored = true;
			} else if (testResult.unignored) {
				isIgnored = false;
			}
		}

		return !isIgnored;
	});
}

/**
 * Options for {@link globWithGitignore}.
 */
export interface GlobWithGitignoreOptions {
	/**
	 * The working directory to use for relative patterns.
	 */
	cwd: string;

	/**
	 * Whether to apply gitignore rules to exclude files.
	 * @defaultValue true
	 */
	gitignore?: boolean;
}

/**
 * Glob files with optional gitignore support.
 *
 * @param patterns - Glob patterns to match files.
 * @param options - Options for the glob operation.
 * @returns An array of absolute paths to all files that match the globs.
 *
 * @remarks
 * This function uses tinyglobby for globbing and the `ignore` package for gitignore filtering.
 * The gitignore patterns are read from .gitignore files in the file system hierarchy.
 */
export async function globWithGitignore(
	patterns: readonly string[],
	options: GlobWithGitignoreOptions,
): Promise<string[]> {
	const { cwd, gitignore: applyGitignore = true } = options;

	// Get all files matching the patterns
	const files = await tinyglobbyGlob([...patterns], {
		cwd,
		absolute: true,
	});

	const filtered = !applyGitignore ? files : await filterByGitignore(files, cwd);

	// Sort results for consistent ordering (tinyglobby does not guarantee sorted order)
	return filtered.sort();
}
