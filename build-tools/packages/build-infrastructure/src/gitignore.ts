/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
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
interface GitignoreRuleSet {
	dir: string;
	ignorer: ReturnType<typeof createIgnore>;
}

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
const pendingGitignoreRuleSetsCache = new Map<string, Promise<GitignoreRuleSet[]>>();

/**
 * Clears the cached gitignore rule sets.
 *
 * This can be used by long-running processes (e.g. watch modes) that need to
 * pick up changes to .gitignore files without restarting the process.
 */
export function clearGitignoreRuleSetsCache(): void {
	gitignoreRuleSetsCache.clear();
	pendingGitignoreRuleSetsCache.clear();
}

/**
 * Returns true if the path is inside the provided directory.
 */
function isPathWithinDirectory(filePath: string, dir: string): boolean {
	const relativePath = path.relative(dir, filePath);
	return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

/**
 * Returns true if the error represents a missing file.
 */
function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

/**
 * Reads the .gitignore file in the provided directory, if present.
 */
async function readGitignoreRuleSet(dir: string): Promise<GitignoreRuleSet | undefined> {
	const gitignorePath = path.join(dir, ".gitignore");

	try {
		const content = await readFile(gitignorePath, "utf8");
		return { dir, ignorer: createIgnore().add(content) };
	} catch (error) {
		if (isFileNotFoundError(error)) {
			return undefined;
		}

		throw error;
	}
}

/**
 * Reads the .gitignore file in the provided directory synchronously, if present.
 */
function readGitignoreRuleSetSync(dir: string): GitignoreRuleSet | undefined {
	const gitignorePath = path.join(dir, ".gitignore");

	try {
		const content = readFileSync(gitignorePath, "utf8");
		return { dir, ignorer: createIgnore().add(content) };
	} catch (error) {
		if (isFileNotFoundError(error)) {
			return undefined;
		}

		throw error;
	}
}

/**
 * Reads gitignore patterns from .gitignore files in the given directory and its
 * parents, returning a list of rule sets ordered from ancestor to descendant.
 * Results are cached per directory path to avoid repeated filesystem reads.
 */
async function readGitignoreRuleSets(dir: string): Promise<GitignoreRuleSet[]> {
	const normalizedDir = path.resolve(dir);
	const cached = gitignoreRuleSetsCache.get(normalizedDir);
	if (cached !== undefined) {
		return cached;
	}

	const pending = pendingGitignoreRuleSetsCache.get(normalizedDir);
	if (pending !== undefined) {
		return pending;
	}

	const loadPromise = (async () => {
		const parentDir = path.dirname(normalizedDir);
		const inheritedRuleSets =
			parentDir === normalizedDir ? [] : await readGitignoreRuleSets(parentDir);
		const currentRuleSet = await readGitignoreRuleSet(normalizedDir);
		const ruleSets =
			currentRuleSet === undefined
				? inheritedRuleSets
				: [...inheritedRuleSets, currentRuleSet];
		gitignoreRuleSetsCache.set(normalizedDir, ruleSets);
		return ruleSets;
	})();

	pendingGitignoreRuleSetsCache.set(normalizedDir, loadPromise);

	try {
		return await loadPromise;
	} finally {
		pendingGitignoreRuleSetsCache.delete(normalizedDir);
	}
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
	const normalizedDir = path.resolve(dir);
	const cached = gitignoreRuleSetsCache.get(normalizedDir);
	if (cached !== undefined) {
		return cached;
	}

	const parentDir = path.dirname(normalizedDir);
	const inheritedRuleSets =
		parentDir === normalizedDir ? [] : readGitignoreRuleSetsSync(parentDir);
	const currentRuleSet = readGitignoreRuleSetSync(normalizedDir);
	const ruleSets =
		currentRuleSet === undefined ? inheritedRuleSets : [...inheritedRuleSets, currentRuleSet];

	gitignoreRuleSetsCache.set(normalizedDir, ruleSets);
	return ruleSets;
}

/**
 * Applies gitignore rules to a single file path.
 */
function shouldIncludeFile(
	file: string,
	cwd: string,
	ruleSets: readonly GitignoreRuleSet[],
): boolean {
	if (!isPathWithinDirectory(file, cwd)) {
		return true;
	}

	let isIgnored = false;

	for (const { dir, ignorer } of ruleSets) {
		if (!isPathWithinDirectory(file, dir)) {
			continue;
		}

		const testResult = ignorer.test(toPosixPath(path.relative(dir, file)));
		if (testResult.ignored) {
			isIgnored = true;
		} else if (testResult.unignored) {
			isIgnored = false;
		}
	}

	return !isIgnored;
}

/**
 * Filters an array of absolute file paths using gitignore rules.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 */
export async function filterByGitignore(files: string[], cwd: string): Promise<string[]> {
	const normalizedCwd = path.resolve(cwd);
	const included = await Promise.all(
		files.map(async (file) => {
			if (!isPathWithinDirectory(file, normalizedCwd)) {
				return true;
			}

			const ruleSets = await readGitignoreRuleSets(path.dirname(file));
			return shouldIncludeFile(file, normalizedCwd, ruleSets);
		}),
	);

	return files.filter((_file, index) => included[index]);
}

/**
 * Filters an array of absolute file paths using gitignore rules synchronously.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 */
export function filterByGitignoreSync(files: string[], cwd: string): string[] {
	const normalizedCwd = path.resolve(cwd);
	return files.filter((file) => {
		if (!isPathWithinDirectory(file, normalizedCwd)) {
			return true;
		}

		const ruleSets = readGitignoreRuleSetsSync(path.dirname(file));
		return shouldIncludeFile(file, normalizedCwd, ruleSets);
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
	const files = await tinyglobbyGlob(patterns, {
		cwd,
		absolute: true,
	});

	const filtered = applyGitignore ? await filterByGitignore(files, cwd) : files;

	return filtered;
}
