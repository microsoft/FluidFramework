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
	// TODO: we currently don't support .yaml and .yml, or config in package.json
	const possibleConfig = [".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc"];
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

export function toPosixPath(s: string) {
	return path.sep === "\\" ? s.replace(/\\/g, "/") : s;
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
	return results.map((p) => (p.endsWith("/") ? p.slice(0, -1) : p));
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

	if (!applyGitignore) {
		return files;
	}

	// Filter files using gitignore rules
	return filterByGitignore(files, cwd);
}

/**
 * Filters an array of absolute file paths using gitignore rules.
 * Reads .gitignore files from the filesystem and applies them to filter files.
 */
async function filterByGitignore(files: string[], cwd: string): Promise<string[]> {
	const ig = createIgnore();

	// Find and read .gitignore files in the cwd and parent directories
	const gitignorePatterns = await readGitignorePatterns(cwd);
	if (gitignorePatterns.length > 0) {
		ig.add(gitignorePatterns);
	}

	// Convert absolute paths to relative paths for filtering, then convert back
	return files.filter((file) => {
		const relativePath = path.relative(cwd, file);
		// Only filter files that are within the cwd
		if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
			return true;
		}
		return !ig.ignores(toPosixPath(relativePath));
	});
}

/**
 * Cache for gitignore patterns per directory path.
 * This avoids re-reading .gitignore files for the same directory.
 */
const gitignorePatternsCache = new Map<string, string[]>();

/**
 * Reads gitignore patterns from .gitignore files in the given directory and its parents.
 * Results are cached per directory path to avoid repeated filesystem reads.
 */
async function readGitignorePatterns(dir: string): Promise<string[]> {
	// Check cache first
	const cached = gitignorePatternsCache.get(dir);
	if (cached !== undefined) {
		return cached;
	}

	const patterns: string[] = [];
	let currentDir = dir;

	// Walk up the directory tree to find .gitignore files
	while (currentDir !== path.dirname(currentDir)) {
		const gitignorePath = path.join(currentDir, ".gitignore");
		if (existsSync(gitignorePath)) {
			try {
				const content = await readFile(gitignorePath, "utf8");
				// Parse gitignore content - each non-empty, non-comment line is a pattern
				const filePatterns = content
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line && !line.startsWith("#"));
				patterns.push(...filePatterns);
			} catch {
				// Ignore errors reading .gitignore files
			}
		}
		currentDir = path.dirname(currentDir);
	}

	// Cache the result
	gitignorePatternsCache.set(dir, patterns);
	return patterns;
}
