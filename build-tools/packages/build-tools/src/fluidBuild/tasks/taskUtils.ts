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

export async function globFn(pattern: string, options: glob.IOptions = {}): Promise<string[]> {
	return new Promise((resolve, reject) => {
		glob.default(pattern, options, (err, matches) => {
			if (err) {
				reject(err);
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
 * When migrating from globby to tinyglobby, this function will need to be updated to manually
 * handle gitignore filtering since tinyglobby doesn't have built-in gitignore support.
 * The approach is to use `git ls-files --others --ignored --exclude-standard` to get ignored files
 * and add them to the ignore list.
 */
export async function globWithGitignore(
	patterns: readonly string[],
	options: GlobWithGitignoreOptions,
): Promise<string[]> {
	const { cwd, gitignore = true } = options;
	return globby([...patterns], {
		cwd,
		absolute: true,
		gitignore,
	});
}
