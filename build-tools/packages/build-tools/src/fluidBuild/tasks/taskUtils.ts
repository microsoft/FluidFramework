/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as path from "path";
import createIgnore from "ignore";
import { glob as tinyglobbyGlob } from "tinyglobby";

import type { PackageJson } from "../../common/npmPackage";
import { lookUpDirSync } from "../../common/utils";

export function getEsLintConfigFilePath(dir: string) {
	// ESLint 9 flat config files (checked first as they take precedence)
	// Then legacy eslintrc files for backwards compatibility
	// TODO: we currently don't support .yaml and .yml, or config in package.json
	const possibleConfig = [
		// ESLint 9 flat config files
		"eslint.config.mjs",
		"eslint.config.mts",
		"eslint.config.cjs",
		"eslint.config.cts",
		"eslint.config.js",
		"eslint.config.ts",
		// Legacy eslintrc files
		".eslintrc.js",
		".eslintrc.cjs",
		".eslintrc.json",
		".eslintrc",
	];
	for (const configFile of possibleConfig) {
		const configFileFullPath = path.join(dir, configFile);
		if (existsSync(configFileFullPath)) {
			return configFileFullPath;
		}
	}
	return undefined;
}

export async function getInstalledPackageVersion(packageName: string, cwd: string) {
	const resolvedPath = require.resolve(packageName, { paths: [cwd] });
	const packageJsonPath = lookUpDirSync(resolvedPath, (currentDir) => {
		return existsSync(path.join(currentDir, "package.json"));
	});
	if (packageJsonPath === undefined) {
		throw new Error(`Unable to find package ${packageName} from ${cwd}`);
	}
	const packageJson: PackageJson = JSON.parse(
		await readFile(path.join(packageJsonPath, "package.json"), "utf8"),
	);
	return packageJson.version;
}

/**
 * Given a directory path, returns an array of all files within the path, rooted in the provided path.
 */
export async function getRecursiveFiles(pathName: string) {
	const files = await readdir(pathName, { withFileTypes: true });
	const result: string[] = [];
	for (let i = 0; i < files.length; i++) {
		const dirent = files[i];
		const subPathName = path.join(pathName, dirent.name);
		if (dirent.name !== "node_modules" && !dirent.name.startsWith(".")) {
			if (dirent.isDirectory()) {
				result.push(...(await getRecursiveFiles(subPathName)));
			} else {
				result.push(subPathName);
			}
		}
	}
	return result;
}

/**
 * Extracts the api-extractor config file path from the api-extractor command line.
 *
 * @param commandLine - api-extractor command line
 */
export function getApiExtractorConfigFilePath(commandLine: string): string {
	const commandArgs = commandLine.split(/\s+/);
	const configFileArg = commandArgs.findIndex((arg) => arg === "--config" || arg === "-c") + 1;
	if (configFileArg > 0 && commandArgs.length > configFileArg) {
		return commandArgs[configFileArg];
	}

	// Default api-extractor config file name
	return "api-extractor.json";
}

/**
 * Converts a path to use forward slashes (POSIX style).
 *
 * @remarks
 * This function is duplicated from `@fluid-tools/build-infrastructure` because build-tools
 * is a CommonJS package and cannot directly import from the ESM-only build-infrastructure package.
 */
export function toPosixPath(s: string): string {
	return s.replace(/\\/g, "/");
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm.
 * Used for testing order-independence when FLUID_BUILD_TEST_RANDOM_ORDER is set.
 *
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference, modified in place)
 */
function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

/**
 * Returns true if runtime order randomization is enabled for testing.
 * When enabled, glob functions will randomize their results to expose order dependencies.
 */
function isRandomOrderTestMode(): boolean {
	return process.env.FLUID_BUILD_TEST_RANDOM_ORDER === "true";
}

/**
 * Options for {@link globFn}.
 * This interface maps to the options supported by tinyglobby.
 */
export interface GlobFnOptions {
	/**
	 * The current working directory to use for relative patterns.
	 */
	cwd?: string;

	/**
	 * When true, only returns files (excludes directories).
	 * @defaultValue true
	 */
	nodir?: boolean;

	/**
	 * When true, includes dotfiles in the results.
	 * @defaultValue false
	 */
	dot?: boolean;

	/**
	 * When true, returns absolute paths instead of relative paths.
	 * @defaultValue false
	 */
	absolute?: boolean;

	/**
	 * Patterns to exclude from the results.
	 */
	ignore?: string | string[];

	/**
	 * When true, follows symbolic links.
	 * @defaultValue true
	 */
	follow?: boolean;
}

/**
 * Glob files using tinyglobby.
 *
 * @param pattern - Glob pattern to match files
 * @param options - Options to pass to glob
 * @returns Promise resolving to array of matched file paths
 *
 * @remarks
 * When the environment variable `FLUID_BUILD_TEST_RANDOM_ORDER` is set to "true", results will be
 * randomly shuffled to expose code that incorrectly depends on glob result ordering. This should only
 * be used in test/CI environments.
 */
export async function globFn(pattern: string, options: GlobFnOptions = {}): Promise<string[]> {
	const { cwd, nodir = true, dot = false, absolute = false, ignore, follow = true } = options;

	// Map options from glob/globby-style to tinyglobby-style
	const results = await tinyglobbyGlob(pattern, {
		cwd,
		onlyFiles: nodir,
		dot,
		absolute,
		ignore: ignore === undefined ? undefined : Array.isArray(ignore) ? ignore : [ignore],
		followSymbolicLinks: follow,
	});

	// When nodir is false (i.e., onlyFiles is false), tinyglobby returns directories
	// with trailing slashes. Remove them for backwards compatibility with the glob package.
	const normalized = results.map((p) => (p.endsWith("/") ? p.slice(0, -1) : p));

	// Test mode: randomize order to expose ordering dependencies
	if (isRandomOrderTestMode()) {
		return shuffleArray([...normalized]);
	}

	// Sort results for consistent ordering (tinyglobby does not guarantee sorted order)
	return normalized.sort();
}

export async function loadModule(modulePath: string, moduleType?: string) {
	const ext = path.extname(modulePath);
	const esm = ext === ".mjs" || (ext === ".js" && moduleType === "module");
	if (esm) {
		return await import(pathToFileURL(modulePath).toString());
	}
	return require(modulePath);
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
 * Glob files with optional gitignore support. This function is used by LeafWithGlobInputOutputDoneFileTask
 * to get input and output files for tasks.
 *
 * @param patterns - Glob patterns to match files.
 * @param options - Options for the glob operation.
 * @returns An array of absolute paths to all files that match the globs.
 *
 * @remarks
 * This function uses tinyglobby for globbing and the `ignore` package for gitignore filtering.
 * The gitignore patterns are read from .gitignore files in the file system hierarchy.
 * When the environment variable `FLUID_BUILD_TEST_RANDOM_ORDER` is set to "true", results will be
 * randomly shuffled to expose code that incorrectly depends on glob result ordering. This should only
 * be used in test/CI environments.
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

	// Test mode: randomize order to expose ordering dependencies
	if (isRandomOrderTestMode()) {
		return shuffleArray([...filtered]);
	}

	// Sort results for consistent ordering (tinyglobby does not guarantee sorted order)
	return filtered.sort();
}

/**
 * Filters an array of absolute file paths using gitignore rules.
 * Reads .gitignore files from the filesystem hierarchy and applies them correctly
 * relative to each .gitignore file's directory.
 *
 * @remarks
 * This function and related gitignore utilities are duplicated from `@fluid-tools/build-infrastructure`
 * because build-tools is a CommonJS package and cannot directly import from the ESM-only
 * build-infrastructure package.
 */
async function filterByGitignore(files: string[], cwd: string): Promise<string[]> {
	// Read .gitignore rule sets for the cwd and its parent directories
	const ruleSets = await readGitignoreRuleSets(cwd);
	if (ruleSets.length === 0) {
		return files;
	}

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
