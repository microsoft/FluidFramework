/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as path from "path";
import * as glob from "glob";
import globby from "globby";

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

export function toPosixPath(s: string) {
	return s.replace(/\\/g, "/");
}

/**
 * Promisified wrapper around the glob library.
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
export async function globFn(pattern: string, options: glob.IOptions = {}): Promise<string[]> {
	return new Promise((resolve, reject) => {
		glob.default(pattern, options, (err, matches) => {
			if (err) {
				reject(err);
				return;
			}

			// Test mode: randomize order to expose ordering dependencies
			if (isRandomOrderTestMode()) {
				resolve(shuffleArray([...matches]));
				return;
			}

			resolve(matches);
		});
	});
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
 * Shuffles an array in place using Fisher-Yates algorithm.
 * Used for testing order-independence when FLUID_BUILD_TEST_RANDOM_ORDER is set to "true".
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
 * @param patterns - Glob patterns to match files. Patterns should be relative paths (e.g., "src/**\/*.ts").
 * Absolute patterns are not recommended as they may behave unexpectedly with the cwd option.
 * @param options - Options for the glob operation.
 * @returns An array of absolute paths to all files that match the globs.
 *
 * @remarks
 * When the environment variable `FLUID_BUILD_TEST_RANDOM_ORDER` is set to "true", results will be
 * randomly shuffled to expose code that incorrectly depends on glob result ordering. This should only
 * be used in test/CI environments.
 */
export async function globWithGitignore(
	patterns: readonly string[],
	options: GlobWithGitignoreOptions,
): Promise<string[]> {
	const { cwd, gitignore = true } = options;
	const results = await globby([...patterns], {
		cwd,
		absolute: true,
		gitignore,
	});

	// Test mode: randomize order to expose ordering dependencies
	if (isRandomOrderTestMode()) {
		return shuffleArray([...results]);
	}

	return results;
}
