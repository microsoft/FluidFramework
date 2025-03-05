/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable prefer-object-has-own */

import fs from "node:fs";
import { createRequire } from "node:module";
import { EOL as newline } from "node:os";
import path from "node:path";
import {
	findGitRootSync,
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
} from "@fluid-tools/build-infrastructure";
import { PackageJson, getApiExtractorConfigFilePath } from "@fluidframework/build-tools";
import depcheck from "depcheck";
import { writeJson } from "fs-extra/esm";
import JSON5 from "json5";
import replace from "replace-in-file";
import sortPackageJson from "sort-package-json";
import { PackageNamePolicyConfig, ScriptRequirement, getFlubConfig } from "../../config.js";
import { Repository } from "../git.js";
import { queryTypesResolutionPathsFromPackageExports } from "../packageExports.js";
import { Handler, readFile, writeFile } from "./common.js";

const require = createRequire(import.meta.url);

const licenseId = "MIT";
const author = "Microsoft and contributors";
const repository = "https://github.com/microsoft/FluidFramework.git";
const homepage = "https://fluidframework.com";
const trademark = `
## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
`;

// Some of our package scopes definitely should publish, and others should never publish.  If they should never
// publish, we want to add the "private": true flag to their package.json to prevent publishing, and conversely if
// they should always publish we should ensure the "private": true flag is not present.  There is then a third
// category of packages which may elect whether or not to publish -- we leave the choice up to those individual
// packages whether to set the flag.

/**
 * Whether the package is known to be a publicly published package for general use.
 */
export function packageMustPublishToNPM(
	name: string,
	config: PackageNamePolicyConfig,
): boolean {
	const mustPublish = config.mustPublish.npm;

	if (mustPublish === undefined) {
		return false;
	}

	for (const pkgOrScope of mustPublish) {
		if (
			(pkgOrScope.startsWith("@") && name.startsWith(`${pkgOrScope}/`)) ||
			name === pkgOrScope
		) {
			return true;
		}
	}

	return false;
}

/**
 * Whether the package is known to be an internally published package but not to NPM.
 * Note that packages published to NPM will also be published internally, however.
 * This should be a minimal set required for legacy compat of internal partners or internal CI requirements.
 */
export function packageMustPublishToInternalFeedOnly(
	name: string,
	config: PackageNamePolicyConfig,
): boolean {
	const mustPublish = config.mustPublish.internalFeed;

	if (mustPublish === undefined) {
		return false;
	}

	for (const pkgOrScope of mustPublish) {
		if (
			(pkgOrScope.startsWith("@") && name.startsWith(`${pkgOrScope}/`)) ||
			name === pkgOrScope
		) {
			return true;
		}
	}

	return false;
}

/**
 * Whether the package has the option to publicly publish if it chooses.
 * For example, an experimental package may choose to remain unpublished until it's ready for customers to try it out.
 */
export function packageMayChooseToPublishToNPM(
	name: string,
	config: PackageNamePolicyConfig,
): boolean {
	const mayPublish = config.mayPublish.npm;

	if (mayPublish === undefined) {
		return false;
	}

	for (const pkgOrScope of mayPublish) {
		if (
			(pkgOrScope.startsWith("@") && name.startsWith(`${pkgOrScope}/`)) ||
			name === pkgOrScope
		) {
			return true;
		}
	}

	return false;
}

/**
 * Whether the package has the option to publish to an internal feed if it chooses.
 */
export function packageMayChooseToPublishToInternalFeedOnly(
	name: string,
	config: PackageNamePolicyConfig,
): boolean {
	const mayPublish = config.mayPublish.internalFeed;

	if (mayPublish === undefined) {
		return false;
	}

	for (const pkgOrScope of mayPublish) {
		if (
			(pkgOrScope.startsWith("@") && name.startsWith(`${pkgOrScope}/`)) ||
			name === pkgOrScope
		) {
			return true;
		}
	}

	return false;
}

/**
 * If we haven't explicitly OK'd the package scope to publish in one of the categories above, it must be marked
 * private to prevent publishing.
 */
export function packageMustBePrivate(name: string, root: string): boolean {
	const config = getFlubConfig(root).policy?.packageNames;

	if (config === undefined) {
		// Unless configured, all packages must be private
		return true;
	}

	return !(
		packageMustPublishToNPM(name, config) ||
		packageMayChooseToPublishToNPM(name, config) ||
		packageMustPublishToInternalFeedOnly(name, config) ||
		packageMayChooseToPublishToInternalFeedOnly(name, config)
	);
}

/**
 * If we know a package needs to publish somewhere, then it must not be marked private to allow publishing.
 */
export function packageMustNotBePrivate(name: string, root: string): boolean {
	const config = getFlubConfig(root).policy?.packageNames;

	if (config === undefined) {
		// Unless configured, all packages must be private
		return false;
	}

	return (
		packageMustPublishToNPM(name, config) || packageMustPublishToInternalFeedOnly(name, config)
	);
}

/**
 * Whether the package either belongs to a known Fluid package scope or is a known unscoped package.
 */
function packageIsFluidPackage(name: string, root: string): boolean {
	const config = getFlubConfig(root).policy?.packageNames;

	if (config === undefined) {
		// Unless configured, all packages are considered Fluid packages
		return true;
	}

	return packageScopeIsAllowed(name, config) || packageIsKnownUnscoped(name, config);
}

/**
 * Returns true if the package scope matches the .
 */
function packageScopeIsAllowed(name: string, config: PackageNamePolicyConfig): boolean {
	const allowedScopes = config?.allowedScopes;

	if (allowedScopes === undefined) {
		// No config, so all scopes are invalid.
		return false;
	}

	for (const allowedScope of allowedScopes) {
		if (name.startsWith(`${allowedScope}/`)) {
			return true;
		}
	}

	return false;
}

/**
 * Returns true if the name matches one of the configured known unscoped package names.
 */
function packageIsKnownUnscoped(name: string, config: PackageNamePolicyConfig): boolean {
	const unscopedPackages = config?.unscopedPackages;

	if (unscopedPackages === undefined) {
		// No config, return false for all values
		return false;
	}

	for (const allowedPackage of unscopedPackages) {
		if (name === allowedPackage) {
			return true;
		}
	}

	return false;
}

/**
 * An array of known npm feeds used in the Fluid Framework CI pipelines.
 */
export const feeds = [
	/**
	 * The public npm feed at npmjs.org.
	 */
	"public",

	/**
	 * Contains per-commit to microsoft/FluidFramework main releases of all Fluid packages that are available in the
	 * public feed, plus some internal-only packages.
	 */
	"internal-build",

	/**
	 * Contains test packages, i.e. packages published from a branch in the microsoft/FluidFramework repository beginning
	 * with test/.
	 */
	"internal-test",

	/**
	 * Contains packages private to the FluidFramework repository (\@fluid-private packages). These should only be
	 * referenced as devDependencies by other packages in FluidFramework and its pipelines.
	 */
	"internal-dev",
] as const;

/**
 * A type representing the known npm feeds used in the Fluid Framework CI pipelines.
 */
export type Feed = (typeof feeds)[number];

/**
 * Type guard. Returns true if the provided string is a known npm feed.
 */
export function isFeed(str: string | undefined): str is Feed {
	if (str === undefined) {
		return false;
	}
	return (feeds as readonly string[]).includes(str);
}

/**
 * Determines if a package should be published to a specific npm feed per the provided config.
 */
export function packagePublishesToFeed(
	name: string,
	config: PackageNamePolicyConfig,
	feed: Feed,
): boolean {
	const publishPublic =
		packageMustPublishToNPM(name, config) || packageMayChooseToPublishToNPM(name, config);
	const publishInternalBuild =
		publishPublic || packageMustPublishToInternalFeedOnly(name, config);

	// eslint-disable-next-line default-case
	switch (feed) {
		case "public": {
			return publishPublic;
		}

		// The build and dev feed should be mutually exclusive
		case "internal-build": {
			return publishInternalBuild;
		}

		case "internal-dev": {
			return (
				!publishInternalBuild && packageMayChooseToPublishToInternalFeedOnly(name, config)
			);
		}

		case "internal-test": {
			return true;
		}
	}

	return false;
}

type IReadmeInfo =
	| {
			exists: false;
			filePath: string;
	  }
	| {
			exists: true;
			filePath: string;
			title: string;
			trademark: boolean;
			readme: string;
	  };

function getReadmeInfo(dir: string): IReadmeInfo {
	const filePath = path.join(dir, "README.md");
	if (!fs.existsSync(filePath)) {
		return { exists: false, filePath };
	}

	const readme = readFile(filePath);
	const lines = readme.split(/\r?\n/);
	const titleMatches = /^# (.+)$/.exec(lines[0]); // e.g. # @fluidframework/build-tools
	const title = titleMatches?.[1] ?? "";
	return {
		exists: true,
		filePath,
		title,
		trademark: readme.includes(trademark),
		readme,
	};
}

let computedPrivatePackages: Set<string> | undefined;
async function ensurePrivatePackagesComputed(): Promise<Set<string>> {
	if (computedPrivatePackages !== undefined) {
		return computedPrivatePackages;
	}

	computedPrivatePackages = new Set();
	const baseDir = findGitRootSync();
	const repo = new Repository({ baseDir }, "microsoft/FluidFramework");
	const packageJsons = await repo.getFiles("**/package.json");

	for (const filePath of packageJsons) {
		const packageJson = JSON.parse(readFile(filePath)) as PackageJson;
		if (packageJson.private ?? false) {
			computedPrivatePackages.add(packageJson.name);
		}
	}

	return computedPrivatePackages;
}

interface ParsedArg {
	arg: string;
	original: string;
}

/**
 * Parses command line string into arguments following OS quote rules.
 *
 * Note: no accommodation is made for a line of script where shell features are used
 * such as redirects `>`, pipes `|`, or multiple command separators `&&` or `;`.
 *
 * @param commandLine - complete command line as a simple string
 * @param onlyDoubleQuotes - only consider double quotes for grouping
 * @returns array of ordered pairs of resolved `arg` strings (quotes and escapes resolved)
 * and `original` corresponding strings.
 */
function parseArgs(
	commandLine: string,
	{ onlyDoubleQuotes }: { onlyDoubleQuotes: boolean },
): ParsedArg[] {
	const regexArg = onlyDoubleQuotes
		? /(?<!\S)(?:[^\s"\\]|\\\S)*(?:(").*?(?:(?<=[^\\](?:\\\\)*)\1(?:[^\s"\\]|\\\S)*|$))*(?!\S)/g
		: /(?<!\S)(?:[^\s"'\\]|\\\S)*(?:(["']).*?(?:(?<=[^\\](?:\\\\)*)\1(?:[^\s"'\\]|\\\S)*|$))*(?!\S)/g;
	const regexQuotedSegment = onlyDoubleQuotes
		? /(?:^|(?<=(?:[^\\]|^)(?:\\\\)*))(")(.*?)(?:(?<=[^\\](?:\\\\)*)\1|$)/g
		: /(?:^|(?<=(?:[^\\]|^)(?:\\\\)*))(["'])(.*?)(?:(?<=[^\\](?:\\\\)*)\1|$)/g;
	const regexEscapedCharacters = onlyDoubleQuotes ? /\\(["\\])/g : /\\(["'\\])/g;
	return [...commandLine.matchAll(regexArg)].map((matches) => ({
		arg: matches[0].replace(regexQuotedSegment, "$2").replace(regexEscapedCharacters, "$1"),
		original: matches[0],
	}));
}

/**
 * Applies universally understood grouping and escaping to form a single argument
 * text to be used as part of a command line string.
 *
 * @param resolvedArg - string as it should appear to new process
 * @returns preferred string to use within a command line string
 */
function quoteAndEscapeArgsForUniversalCommandLine(
	resolvedArg: string,
	{ forceQuote }: { forceQuote?: boolean } = {},
): string {
	// Unix shells provide feature where arguments that can be resolved as globs
	// are expanded before passed to new process. Detect those and group them
	// to ensure consistent arg passing. (Grouping disables glob expansion.)
	const regexGlob = /[*?[]|\([^)]*\)/;
	const notAGlob = resolvedArg.startsWith("-") || !regexGlob.test(resolvedArg);
	// Double quotes are used for grouping arguments with whitespace and must be
	// escaped with \ and \ itself must therefore be escaped.
	// Unix shells also use single quotes for grouping. Rather than escape those,
	// which Windows command shell would not unescape, those args must be grouped.
	const escapedArg = resolvedArg.replace(/(["\\])/g, "\\$1");
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	const canBeUnquoted = notAGlob && !forceQuote && !/[\s']/.test(resolvedArg);
	return canBeUnquoted ? escapedArg : `"${escapedArg}"`;
}

/**
 * Prepares argument to be part of command script line. It does some handling for
 * special shell elements that parseArgs ignores.
 *
 * @param parsedArg - one result from parseArgs
 * @returns preferred string to use within a command script string
 */
function quoteAndEscapeArgsForUniversalScriptLine({ arg, original }: ParsedArg): string {
	// Check for exactly `&&` or `|`.
	if (arg === "&&" || arg === "|") {
		// Use quoting if original had any quoting.
		return arg === original ? arg : `"${arg}"`;
	}

	// Check for unquoted start of `&&` or `|`.
	if (!/^["']/.test(original)) {
		const specialStart = /(^&&|^\|)(.+)$/.exec(arg);
		if (specialStart) {
			// Separate the `&&` or `|` from remainder that will be its own arg.
			const remainder = quoteAndEscapeArgsForUniversalScriptLine({
				arg: specialStart[2],
				original: original.slice(specialStart[1].length),
			});
			return `${specialStart[1]} ${remainder}`;
		}
	}

	// Check for unquoted tail `|`.
	if (!/["']$/.test(original)) {
		const specialEnd = /^(.+)\|$/.exec(arg);
		if (specialEnd) {
			// Separate the `|` from prior that will be its own arg.
			const prior = quoteAndEscapeArgsForUniversalScriptLine({
				arg: specialEnd[1],
				original: original.slice(0, Math.max(0, original.length - 1)),
			});
			return `${prior} |`;
		}
	}

	// Among the special characters `>`, `|`, `;`, and `&`, check for `&` at
	// start, pipe (with anything else), or `;`. Some common `&` uses like `2>&1`
	// should also remain unquoted.
	const forceQuote = /^&|[;|]/.test(arg);

	return quoteAndEscapeArgsForUniversalCommandLine(arg, { forceQuote });
}

/**
 * Parse script line as if unix shell, then form preferred script line.
 *
 * @param scriptLine - unparsed script line
 * @returns preferred command line
 */
function getPreferredScriptLine(scriptLine: string): string {
	return (
		parseArgs(scriptLine, { onlyDoubleQuotes: false })
			// eslint-disable-next-line unicorn/no-array-callback-reference
			.map(quoteAndEscapeArgsForUniversalScriptLine)
			.join(" ")
	);
}

/**
 * Read the "mainEntryPointFilePath" value from the api-extractor-lint config file.
 * @param configFileAbsPath - api-exractor-lint config file path
 * @param projectRoot - project root directory (package.json directory)
 * @returns "mainEntryPointFilePath" value relative to {@link projectRoot}
 */
async function readConfigMainEntryPointFilePath(
	configFileAbsPath: string,
	projectRoot: string,
): Promise<string | undefined> {
	return fs.promises
		.readFile(configFileAbsPath, { encoding: "utf8" })
		.then(async (configContent) => {
			const { mainEntryPointFilePath } = JSON5.parse<{
				mainEntryPointFilePath?: string;
			}>(configContent);
			if (mainEntryPointFilePath === undefined) {
				return undefined;
			}
			// mainEntryPointFilePath is relative to the config file
			// directory unless it is prefixed with <projectFolder>
			// which is replaced with the project root directory.
			const mainEntryPointFilePathWithoutProjectFolder = mainEntryPointFilePath.replace(
				/^<projectFolder>\//,
				"./",
			);
			if (mainEntryPointFilePathWithoutProjectFolder !== mainEntryPointFilePath) {
				return mainEntryPointFilePathWithoutProjectFolder;
			}
			const mainEntryPointFileAbsPath = path.join(
				path.dirname(configFileAbsPath),
				mainEntryPointFilePath,
			);
			return `./${path
				.relative(projectRoot, mainEntryPointFileAbsPath)
				.replaceAll("\\", "/")}`;
		});
}

/**
 * Read the package.json scripts to find the api-extractor lint commands and
 * the files they cover. Remove covered files from needLinted.
 */
async function removeLintedExportsPathsAsync(
	packageJson: PackageJson,
	dir: string,
	needLinted: Map<string, unknown>,
): Promise<void> {
	const promises: Promise<void>[] = [];
	for (const [name, commands] of Object.entries(packageJson.scripts ?? {})) {
		// Expect api-extractor lint commands are named check:exports:*
		if (!name.startsWith("check:exports:")) {
			continue;
		}
		if (typeof commands !== "string") {
			continue;
		}
		for (const command of commands.split("&&")) {
			if (command.startsWith("api-extractor run")) {
				const configFileRelPath = getApiExtractorConfigFilePath(command);
				const configFileAbsPath = path.resolve(dir, configFileRelPath);
				promises.push(
					readConfigMainEntryPointFilePath(configFileAbsPath, dir)
						.then((mainEntryPointFilePath) => {
							if (mainEntryPointFilePath !== undefined) {
								needLinted.delete(mainEntryPointFilePath);
							}
						})
						.catch((error) =>
							console.warn(
								`Error parsing API Extractor config: ${configFileAbsPath} for ${packageJson.name} "${name}".\n\t${error}`,
							),
						),
				);
			}
		}
	}
	await Promise.all(promises);
}

interface ScriptEntry {
	name: string;
	commandLine: string;
}

/**
 * Determine missing elements to properly lint API exports.
 *
 * @remarks Does not check that api-extractor config files have linting enabled.
 *
 * @param packageJson - package.json contents
 * @param dir - directory of package.json
 * @returns record of missing requirements or with unexpected values
 */
async function getApiLintElementsMissing(
	packageJson: Readonly<PackageJson>,
	dir: string,
): Promise<{
	scriptEntries: ScriptEntry[];
	configFiles: Map<string, string>;
	devDependencies: string[];
	targetsImpacted: Set<string>;
}> {
	const scriptEntries: ScriptEntry[] = [];
	const configFiles = new Map<string, string>();
	const devDependencies: string[] = [];
	const targetsImpacted = new Set<string>();
	const missing = { scriptEntries, configFiles, devDependencies, targetsImpacted };

	const exportsField = packageJson.exports;
	if (exportsField === undefined) {
		return missing;
	}

	const { mapTypesPathToExportPaths } = queryTypesResolutionPathsFromPackageExports(
		packageJson,
		new Map([[/\.d\.ts$/, undefined]]),
		{ node10TypeCompat: false, onlyFirstMatches: false },
	);

	const needsLinted = new Map<string, string>();
	let internalLintTarget: string | undefined;
	let rootLintTarget: string | undefined;
	for (const [relPath, exports] of mapTypesPathToExportPaths.entries()) {
		const onlyRequire = exports.every((e) => e.conditions.includes("require"));
		const onlyImport = exports.every((e) => e.conditions.includes("import"));
		const skew = onlyRequire ? "cjs:" : onlyImport ? "esm:" : "";
		if (exports.some((e) => !e.exportPath.startsWith("./internal"))) {
			const existingSkew = needsLinted.get(relPath);
			if (existingSkew === undefined) {
				needsLinted.set(relPath, skew);
			} else if (existingSkew !== skew) {
				needsLinted.set(relPath, "");
			}
			// Keep track of root exports for cross group consistency checks
			// in case there isn't an ./internal export.
			if (exports.some((e) => e.exportPath === ".")) {
				// Only one file needs to be checked for this. Prefer export that
				// is not 'require' restricted.
				// eslint-disable-next-line unicorn/no-lonely-if
				if (rootLintTarget === undefined || !onlyRequire) {
					rootLintTarget = relPath;
				}
			}
		} else if (exports.some((e) => e.exportPath === "./internal")) {
			// ./internal export should be checked for cross group consistency.
			// Only one file needs to be checked for this. Prefer export that
			// is not 'require' restricted.
			// eslint-disable-next-line unicorn/no-lonely-if
			if (internalLintTarget === undefined || !onlyRequire) {
				internalLintTarget = relPath;
			}
		}
	}
	if (needsLinted.size === 0 && internalLintTarget === undefined) {
		// No files need linting
		return missing;
	}

	// -------------------------------------------------------------------------
	// There are files that need linting.

	function addAllTargets(): void {
		if (internalLintTarget !== undefined) {
			targetsImpacted.add(internalLintTarget);
		}
		for (const target of needsLinted.keys()) {
			targetsImpacted.add(target);
		}
	}

	// Make sure the package.json has the check:exports script that runs others.
	const checkExports = packageJson.scripts?.["check:exports"];
	if (checkExports !== 'concurrently "npm:check:exports:*"') {
		scriptEntries.push({
			name: "check:exports",
			commandLine: 'concurrently "npm:check:exports:*"',
		});
		addAllTargets();
	}

	// Make sure `concurrently` and `@microsoft/api-extractor` are available.
	if (packageJson.devDependencies?.concurrently === undefined) {
		devDependencies.push("concurrently");
		addAllTargets();
	}
	if (packageJson.devDependencies?.["@microsoft/api-extractor"] === undefined) {
		devDependencies.push("@microsoft/api-extractor");
		addAllTargets();
	}

	// The bundle target is specially linted using bundling checks for cross group consistency.
	{
		const bundleLintTarget = internalLintTarget ?? rootLintTarget;
		if (bundleLintTarget !== undefined) {
			const lintBundleTags = packageJson.scripts?.["check:exports:bundle-release-tags"];
			const apiExtractorFile = "api-extractor/api-extractor-lint-bundle.json";
			const commandLine = `api-extractor run --config ${apiExtractorFile}`;
			if (lintBundleTags !== commandLine) {
				scriptEntries.push({
					name: "check:exports:bundle-release-tags",
					commandLine,
				});
				targetsImpacted.add(bundleLintTarget);
			}
			const configFileAbsPath = path.resolve(dir, apiExtractorFile);
			// If the bundle target is not the internal target, then it is the root target
			// or any target appropriate for cross group consistency checks. "*|" is used
			// as a sentinel to allow any target, but also encodes a default file when
			// fixing is invoked.
			configFiles.set(configFileAbsPath, internalLintTarget ?? `*|${rootLintTarget}`);
		}
	}

	// Remove any entries from needLinted that are already covered.
	await removeLintedExportsPathsAsync(packageJson, dir, needsLinted);

	// Form script entries and unique config file names for files without recognized coverage.
	const regexPath = /^(?:\.\/)?(?:lib\/|dist\/)?(?<path>[^/]+(?:\/[^/]+)*)\.d\.ts$/;
	for (const [relPath, skew] of needsLinted) {
		const pathMatch = regexPath.exec(relPath);
		const scriptEntry = pathMatch?.groups?.path.replace(/\//g, ":") ?? "";
		const apiExtractorFile = `api-extractor/api-extractor-lint-${scriptEntry.replaceAll(
			":",
			"_",
		)}.${skew.replaceAll(":", ".")}json`;
		const scriptEntryName = `check:exports:${skew}${scriptEntry}`;
		const scriptCommand = `api-extractor run --config ${apiExtractorFile}`;
		scriptEntries.push({ name: scriptEntryName, commandLine: scriptCommand });
		const configFileAbsPath = path.resolve(dir, apiExtractorFile);
		configFiles.set(configFileAbsPath, relPath);
		targetsImpacted.add(relPath);
	}

	// Check for the presence of the api-extractor-lint-* files with the expected
	// mainEntryPointFilePath values.
	const configAndTargetFilesArray = [...configFiles.entries()];
	await Promise.all(
		configAndTargetFilesArray.map(async ([configFileNeeded, target]) =>
			readConfigMainEntryPointFilePath(configFileNeeded, dir)
				.then((mainEntryPointFilePath) => {
					if (
						mainEntryPointFilePath !== undefined &&
						(mainEntryPointFilePath === target || target.startsWith("*|"))
					) {
						// Satisfied, remove from map of missing.
						configFiles.delete(configFileNeeded);
					}
				})
				.catch(() => undefined),
		),
	);
	// Make sure remaining config targets are in impacted set.
	// Bundle target might not be.
	for (const target of configFiles.values()) {
		targetsImpacted.add(
			target.startsWith("*|") ? "any .d.ts file (for bundle check)" : target,
		);
	}

	return missing;
}

/**
 * Tests that given value is defined.
 */
function isDefined<T>(v: T | undefined): v is T {
	return v !== undefined;
}

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
	{
		name: "npm-package-metadata-and-sorting",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const ret: string[] = [];

			if (JSON.stringify(sortPackageJson(json)) !== JSON.stringify(json)) {
				ret.push(`package.json not sorted`);
			}

			if (json.author !== author) {
				ret.push(`author: "${json.author}" !== "${author}"`);
			}

			if (json.license !== licenseId) {
				ret.push(`license: "${json.license}" !== "${licenseId}"`);
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (!json.repository) {
				ret.push(`repository field missing`);
			} else if (typeof json.repository === "string") {
				ret.push(`repository should be an object, not a string`);
			} else {
				if (json.repository?.url !== repository) {
					ret.push(`repository.url: "${json.repository.url}" !== "${repository}"`);
				}

				// file is already relative to the repo root, so we can use it as-is.
				const relativePkgDir = path.dirname(file).replace(/\\/g, "/");

				// The directory field should be omitted from the root package, so consider this a policy failure.
				if (relativePkgDir === ".") {
					ret.push(
						`repository.directory: "${json.repository.directory}" field is present but should be omitted from root package`,
					);
				} else if (json.repository?.directory !== relativePkgDir) {
					ret.push(
						`repository.directory: "${json.repository.directory}" !== "${relativePkgDir}"`,
					);
				}
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (!json.private && !json.description) {
				ret.push("description: must not be empty");
			}

			if (json.homepage !== homepage) {
				ret.push(`homepage: "${json.homepage}" !== "${homepage}"`);
			}

			if (ret.length > 1) {
				return `${ret.join(newline)}`;
			}
			if (ret.length === 1) {
				return ret[0];
			}

			return undefined;
		},
		resolver: (file: string): { resolved: boolean } => {
			updatePackageJsonFile(path.dirname(file), (json) => {
				json.author = author;
				json.license = licenseId;

				// file is already relative to the repo root, so we can use it as-is.
				const relativePkgDir = path.dirname(file).replace(/\\/g, "/");
				json.repository =
					// The directory field should be omitted from the root package.
					relativePkgDir === "."
						? {
								type: "git",
								url: repository,
							}
						: {
								type: "git",
								url: repository,
								directory: relativePkgDir,
							};

				json.homepage = homepage;
			});

			return { resolved: true };
		},
	},
	{
		// Verify that we're not introducing new scopes or unscoped packages unintentionally.
		// If you'd like to introduce a new package scope or a new unscoped package, please discuss it first.
		name: "npm-strange-package-name",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			// "root" is the package name for monorepo roots, so ignore them
			if (!packageIsFluidPackage(json.name, root) && json.name !== "root") {
				const matched = json.name.match(/^(@.+)\//);
				if (matched !== null) {
					return `Scope ${matched[1]} is an unexpected Fluid scope`;
				}
				return `Package ${json.name} is an unexpected unscoped package`;
			}
		},
	},
	{
		// Verify that packages are correctly marked private or not.
		// Also verify that non-private packages don't take dependencies on private packages.
		name: "npm-private-packages",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const privatePackages = await ensurePrivatePackagesComputed();
			const errors: string[] = [];

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (json.private && packageMustNotBePrivate(json.name, root)) {
				errors.push(`Package ${json.name} must not be marked private`);
			}

			// Packages publish by default, so we need an explicit true flag to suppress publishing.
			if (json.private !== true && packageMustBePrivate(json.name, root)) {
				errors.push(`Package ${json.name} must be marked private`);
			}

			const deps = Object.keys(json.dependencies ?? {});
			if (json.private !== true && deps.some((name) => privatePackages.has(name))) {
				errors.push(
					`Non-private package must not depend on the private package(s): ${deps
						.filter((name) => privatePackages.has(name))
						.join(",")}`,
				);
			}

			if (errors.length > 0) {
				return `package.json private flag violations: ${newline}${errors.join(newline)}`;
			}
		},
	},
	{
		name: "npm-package-readmes",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);

			if (!readmeInfo.exists) {
				return `Package directory ${packageDir} contains no README.md`;
			}
			if (readmeInfo.title !== packageName) {
				// These packages don't follow the convention of starting the readme with "# PackageName"
				const skip = ["root", "fluid-docs"].includes(packageName);
				if (!skip) {
					return `Readme in package directory ${packageDir} should begin with heading "${json.name}"`;
				}
			}

			if (fs.existsSync(path.join(packageDir, "Dockerfile")) && !readmeInfo.trademark) {
				return `Readme in package directory ${packageDir} with Dockerfile should contain with trademark verbiage`;
			}
		},
		resolver: (file: string): { resolved: boolean; message?: string } => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return { resolved: false, message: `Error parsing JSON file: ${file}` };
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);
			const expectedTitle = `# ${json.name}`;
			const expectTrademark = fs.existsSync(path.join(packageDir, "Dockerfile"));
			if (!readmeInfo.exists) {
				if (expectTrademark) {
					writeFile(readmeInfo.filePath, `${expectedTitle}${newline}${newline}${trademark}`);
				} else {
					writeFile(readmeInfo.filePath, `${expectedTitle}${newline}`);
				}
				return { resolved: true };
			}

			const fixTrademark =
				!readmeInfo.trademark && !readmeInfo.readme.includes("## Trademark");
			if (fixTrademark) {
				const existingNewLine = readmeInfo.readme.endsWith("\n");
				writeFile(
					readmeInfo.filePath,
					`${readmeInfo.readme}${existingNewLine ? "" : newline}${trademark}`,
				);
			}
			if (readmeInfo.title !== packageName) {
				replace.sync({
					files: readmeInfo.filePath,
					from: /^(.*)/,
					to: expectedTitle,
				});
			}

			return { resolved: readmeInfo.trademark || fixTrademark };
		},
	},
	{
		name: "npm-package-folder-name",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const [, scopedName] = packageName.split("/") as [string, string];
			const nameWithoutScope = scopedName ?? packageName;
			const folderName = path.basename(packageDir);

			// We expect the foldername to match the tail of the package name
			// Full match isn't required for cases where the package name is prefixed with names from earlier in the path
			if (!nameWithoutScope.toLowerCase().endsWith(folderName.toLowerCase())) {
				// These packages don't follow the convention of the dir matching the tail of the package name
				const skip = ["root"].includes(packageName);
				if (!skip) {
					return `Containing folder ${folderName} for package ${packageName} should be named similarly to the package`;
				}
			}
		},
	},
	{
		name: "npm-package-license",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (json.private) {
				return;
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const licensePath = path.join(packageDir, "LICENSE");
			const rootLicensePath = path.join(root, "LICENSE");

			if (!fs.existsSync(licensePath)) {
				return `LICENSE file missing for package ${packageName}`;
			}

			const licenseFile = readFile(licensePath);
			const rootFile = readFile(rootLicensePath);
			if (licenseFile !== rootFile) {
				return `LICENSE file in ${packageDir} doesn't match ${rootLicensePath}`;
			}
		},
		resolver: (file: string, root: string): { resolved: boolean; message?: string } => {
			const packageDir = path.dirname(file);
			const licensePath = path.join(packageDir, "LICENSE");
			const rootLicensePath = path.join(root, "LICENSE");
			try {
				fs.copyFileSync(rootLicensePath, licensePath);
			} catch {
				return {
					resolved: false,
					message: `Error copying file from ${rootLicensePath} to ${licensePath}`,
				};
			}
			return { resolved: true };
		},
	},
	{
		name: "npm-package-json-prettier",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");
			const missingScripts: string[] = [];

			if (hasScriptsField) {
				const hasPrettierScript = Object.prototype.hasOwnProperty.call(
					json.scripts,
					"prettier",
				);
				const hasPrettierFixScript = Object.prototype.hasOwnProperty.call(
					json.scripts,
					"prettier:fix",
				);
				const hasFormatScript = Object.prototype.hasOwnProperty.call(json.scripts, "format");
				const isLernaFormat = json.scripts.format?.includes("lerna");

				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				if (!isLernaFormat && (hasPrettierScript || hasPrettierFixScript || hasFormatScript)) {
					if (!hasPrettierScript) {
						missingScripts.push(`prettier`);
					}

					if (!hasPrettierFixScript) {
						missingScripts.push(`prettier:fix`);
					}

					if (!hasFormatScript) {
						missingScripts.push(`format`);
					}
				}
			}

			return missingScripts.length > 0
				? `${file} is missing the following scripts: ${missingScripts.join("\n\t")}`
				: undefined;
		},
		resolver: (file: string): { resolved: boolean; message?: string } => {
			updatePackageJsonFile(path.dirname(file), (json) => {
				const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");

				if (hasScriptsField) {
					const hasFormatScriptResolver = Object.prototype.hasOwnProperty.call(
						json.scripts,
						"format",
					);

					const hasPrettierScriptResolver = Object.prototype.hasOwnProperty.call(
						json.scripts,
						"prettier",
					);

					const hasPrettierFixScriptResolver = Object.prototype.hasOwnProperty.call(
						json.scripts,
						"prettier:fix",
					);

					if (
						hasFormatScriptResolver ||
						hasPrettierScriptResolver ||
						hasPrettierFixScriptResolver
					) {
						const formatScript = json.scripts?.format?.includes("lerna");
						const prettierScript = json.scripts?.prettier?.includes("--ignore-path");
						const prettierFixScript =
							json.scripts?.["prettier:fix"]?.includes("--ignore-path");
						// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
						if (json.scripts !== undefined && !formatScript) {
							json.scripts.format = "npm run prettier:fix";
							// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
							if (!prettierScript) {
								json.scripts.prettier = "prettier --check .";
							}
							// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
							if (!prettierFixScript) {
								json.scripts["prettier:fix"] = "prettier --write .";
							}
						}
					}
				}
			});

			return { resolved: true };
		},
	},
	{
		name: "npm-package-json-script-clean",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");
			const missingScripts: string[] = [];

			if (hasScriptsField) {
				const hasBuildScript = Object.prototype.hasOwnProperty.call(json.scripts, "build");
				const hasCleanScript = Object.prototype.hasOwnProperty.call(json.scripts, "clean");

				if (hasBuildScript && !hasCleanScript) {
					missingScripts.push(`clean`);
				}
			}

			return missingScripts.length > 0
				? `${file} is missing the following scripts: \n\t${missingScripts.join("\n\t")}`
				: undefined;
		},
	},
	{
		name: "npm-package-json-script-dep",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			const manifest = getFlubConfig(root);
			const commandPackages = manifest.policy?.dependencies?.commandPackages;
			if (commandPackages === undefined) {
				return;
			}
			const commandDep = new Map(commandPackages);
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");
			const missingDeps: string[] = [];

			if (hasScriptsField) {
				const regexNpmAlias = /^npm:(?<alias>.+)@/;
				// Get names of all of the packages that are dependencies or devDependencies
				// resolving any aliases.
				// This does not support an attempt to workaround policy by using an alias
				// to expected package name, but installing alternate bin package. In such
				// a case a temporary policy exclusion can be used.
				const deps = new Set<string>(
					[
						...Object.entries(json.dependencies ?? {}),
						...Object.entries(json.devDependencies ?? {}),
					].map(([depName, versionSpec]) => {
						const alias = versionSpec?.match(regexNpmAlias)?.groups?.alias;
						return alias ?? depName;
					}),
				);
				const commands = new Set(
					Object.values(json.scripts)
						// eslint-disable-next-line unicorn/no-array-callback-reference
						.filter(isDefined)
						.map((s) => s.split(" ")[0]),
				);
				for (const command of commands.values()) {
					const dep = commandDep.get(command);
					if (
						// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
						dep &&
						!deps.has(dep)
					) {
						missingDeps.push(`Package '${dep}' missing needed by command '${command}'`);
					}
				}
			}

			return missingDeps.length > 0
				? `${file} is missing the following dependencies or devDependencies: \n\t${missingDeps.join(
						"\n\t",
					)}`
				: undefined;
		},
	},
	{
		name: "npm-package-json-scripts-args",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");
			if (!hasScriptsField) {
				return undefined;
			}

			const scriptsUsingInconsistentArgs = Object.entries(json.scripts)
				.filter(([, scriptContent]) => {
					const commandLine = scriptContent as string;
					const preferredCommandLine = getPreferredScriptLine(commandLine);
					return commandLine !== preferredCommandLine;
				})
				.map(([scriptName]) => scriptName);

			return scriptsUsingInconsistentArgs.length > 0
				? `${file} using inconsistent arguments in the following scripts:\n\t${scriptsUsingInconsistentArgs.join(
						"\n\t",
					)}`
				: undefined;
		},
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				for (const [scriptName, scriptContent] of Object.entries(json.scripts)) {
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
					if (scriptContent) {
						json.scripts[scriptName] = getPreferredScriptLine(scriptContent);
					}
				}
			});

			return result;
		},
	},
	{
		name: "npm-package-json-test-scripts",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rules enforces that if the package have test files (in 'src/test', excluding 'src/test/types'),
			// or mocha/jest dependencies, it should have a test scripts so that the pipeline will pick it up

			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const packageDir = path.dirname(file);
			const { scripts } = json;
			if (
				scripts !== undefined &&
				Object.keys(scripts).some((name) => name.startsWith("test"))
			) {
				// Found test script
				return undefined;
			}

			const testDir = path.join(packageDir, "src", "test");
			if (fs.existsSync(testDir)) {
				const info = fs.readdirSync(testDir, { withFileTypes: true });
				if (
					info.some(
						(e) => path.extname(e.name) === ".ts" || (e.isDirectory() && e.name !== "types"),
					)
				) {
					return "Test files exists but no test scripts";
				}
			}

			const dep = ["mocha", "@types/mocha", "jest", "@types/jest"];
			if (
				(json.dependencies &&
					// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
					Object.keys(json.dependencies).some((name) => dep.includes(name))) ||
				(json.devDependencies &&
					Object.keys(json.devDependencies).some((name) => dep.includes(name)))
			) {
				return `Package has one of "${dep.join(",")}" dependency but no test scripts`;
			}
		},
	},
	{
		name: "npm-package-json-test-scripts-split",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces that because the pipeline split running these test in different steps, each project
			// has the split set up property (into test:mocha, test:jest and test:realsvc). Release groups that don't
			// have splits in the pipeline is excluded in the "handlerExclusions" in the fluidBuild.config.cjs
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const { scripts } = json;
			if (scripts === undefined) {
				return undefined;
			}
			const testScript = scripts.test;

			const splitTestScriptNames = ["test:mocha", "test:jest", "test:realsvc"];

			if (testScript === undefined) {
				if (splitTestScriptNames.some((name) => scripts[name] !== undefined)) {
					return "Missing 'test' scripts";
				}
				return undefined;
			}

			const actualSplitTestScriptNames = splitTestScriptNames.filter(
				(name) => scripts[name] !== undefined,
			);

			if (actualSplitTestScriptNames.length === 0) {
				if (!testScript.startsWith("echo ")) {
					return "Missing split test scripts. The 'test' script must call one or more \"split\" scripts like 'test:mocha', 'test:jest', or 'test:realsvc'.";
				}
				return undefined;
			}
			const expectedTestScript = actualSplitTestScriptNames
				.map((name) => `npm run ${name}`)
				.join(" && ");
			if (testScript !== expectedTestScript) {
				return `Unexpected test script:\n\tactual: ${testScript}\n\texpected: ${expectedTestScript}`;
			}
		},
	},
	{
		name: "npm-package-json-script-mocha-config",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces that mocha will use a config file and setup both the console, json and xml reporters.
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const { scripts } = json;
			if (scripts === undefined) {
				return undefined;
			}
			const mochaScriptName = scripts["test:mocha"] === undefined ? "test" : "test:mocha";
			const mochaScript = scripts[mochaScriptName];

			if (mochaScript === undefined || !mochaScript.startsWith("mocha")) {
				// skip irregular test script for now
				return undefined;
			}

			const packageDir = path.dirname(file);
			const mochaRcNames = [".mocharc", ".mocharc.js", ".mocharc.json", ".mocharc.cjs"];
			const mochaRcName = mochaRcNames.find((name) =>
				fs.existsSync(path.join(packageDir, name)),
			);

			if (mochaRcName === undefined && !mochaScript.includes(" --config ")) {
				return "Missing config arguments";
			}
		},
	},

	{
		name: "npm-package-json-script-jest-config",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces that jest will use a config file and setup both the default (console) and junit reporters.
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const { scripts } = json;
			if (scripts === undefined) {
				return undefined;
			}
			const jestScriptName = scripts["test:jest"] === undefined ? "test" : "test:jest";
			const jestScript = scripts[jestScriptName];

			if (jestScript === undefined || !jestScript.startsWith("jest")) {
				// skip irregular test script for now
				return undefined;
			}

			const packageDir = path.dirname(file);
			const jestFileName = ["jest.config.js", "jest.config.cjs"].find((name) =>
				fs.existsSync(path.join(packageDir, name)),
			);
			if (jestFileName === undefined) {
				return `Missing jest config file.`;
			}

			const jestConfigFile = path.join(packageDir, jestFileName);
			// This assumes that the jest config will be in CommonJS, because if it's ESM the require call will fail.
			const config = require(path.resolve(jestConfigFile)) as { reporters?: unknown };
			if (config.reporters === undefined) {
				return `Missing reporters in '${jestConfigFile}'`;
			}

			const expectedReporter = [
				"default",
				[
					"jest-junit",
					{
						outputDirectory: "nyc",
						outputName: "jest-junit-report.xml",
					},
				],
			];

			if (JSON.stringify(config.reporters) !== JSON.stringify(expectedReporter)) {
				return `Unexpected reporters in '${jestConfigFile}'`;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			if ((json as any)["jest-junit"] !== undefined) {
				return `Extraneous jest-unit config in ${file}`;
			}
		},
	},
	{
		name: "npm-package-json-esm",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces that we have a type (or legacy module) field in the package iff
			// we have an ESM build.
			// Note that setting for type is not checked. Presence of the field indicates that
			// some thought has been put in place. The package might be CJS first and ESM second
			// with a secondary package.json specifying "type": "module" or use .mjs extensions.
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const { scripts } = json;
			if (scripts === undefined) {
				return undefined;
			}
			// Using the heuristic that our package use "build:esnext" or "tsc:esnext" to indicate
			// that it has a ESM build.
			// Newer packages may be ESM only and just use tsc to build ESM, which isn't detected.
			const esnextScriptsNames = ["build:esnext", "tsc:esnext"];
			const hasBuildEsNext = esnextScriptsNames.some((name) => scripts[name] !== undefined);
			const hasModuleOutput = json.module !== undefined;

			if (hasBuildEsNext) {
				if (json.type === undefined && !hasModuleOutput) {
					return "Missing 'type' (or legacy 'module') field in package.json for ESM build";
				}
			} else if (hasModuleOutput && json.main !== json.module) {
				// If we don't have a separate esnext build, it's still ok to have the "module"
				// field if it is the same as "main"
				return "Missing ESM build script while package.json has 'module' field";
			}
		},
	},
	{
		name: "npm-package-json-clean-script",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces the "clean" script will delete all the build and test output
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			const { scripts } = json;
			if (scripts === undefined) {
				return undefined;
			}

			const cleanScript = scripts.clean;
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (cleanScript) {
				// Ignore clean scripts that are root of the release group
				if (cleanScript.startsWith("pnpm") || cleanScript.startsWith("fluid-build")) {
					return undefined;
				}

				// Enforce clean script prefix
				if (!cleanScript.startsWith("rimraf --glob ")) {
					return "'clean' script should start with 'rimraf --glob'";
				}
			}

			const missing = missingCleanDirectories(scripts);

			if (missing.length > 0) {
				return `'clean' script missing the following:${missing
					.map((i) => `\n\t${i}`)
					.join("")}`;
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (cleanScript && cleanScript !== getPreferredScriptLine(cleanScript)) {
				return "'clean' script should double quote the globs and only the globs";
			}
		},
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				const missing = missingCleanDirectories(json.scripts);
				let clean: string = json.scripts.clean ?? "rimraf --glob";
				if (!clean.startsWith("rimraf --glob")) {
					result.resolved = false;
					result.message =
						"Unable to fix 'clean' script that doesn't start with 'rimraf --glob'";
					return;
				}
				if (missing.length > 0) {
					clean += ` ${missing.join(" ")}`;
				}
				// clean up for grouping
				json.scripts.clean = getPreferredScriptLine(clean);
			});

			return result;
		},
	},
	{
		name: "npm-package-types-field",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			// This rule enforces each package has a types field in its package.json
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			if (
				// Ignore private packages...
				json.private === true ||
				// and those without main/module defined
				(json.main === undefined && json.module === undefined) ||
				// and packages without a tsconfig
				!fs.existsSync(path.join(path.dirname(file), "tsconfig.json"))
			) {
				return;
			}

			if (json.types === undefined) {
				return "Missing 'types' field in package.json.";
			}
		},
	},
	{
		// This rule enforces each package has an exports field in its package.json. It also verifies that the values in the
		// exports["."] field match the ones in the main/module/types fields.
		name: "npm-package-exports-field",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let json: PackageJson;

			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			if (!shouldCheckExportsField(json)) {
				return;
			}

			const exportsField = json.exports;
			if (exportsField === undefined) {
				return "Missing 'exports' field in package.json.";
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			const exportsRoot = (exportsField as any)?.["."];
			if (exportsRoot === undefined) {
				return "Missing '.' entry in 'exports' field in package.json.";
			}

			if (json.main === undefined) {
				return "Missing 'main' entry in package.json.";
			}

			const isCJSOnly = json.module === undefined || json.type === "commonjs";
			const isESMOnly = json.type === "module";

			// CJS- and ESM-only packages should use default, not import or require.
			const defaultField =
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				exportsRoot?.default?.default === undefined
					? undefined
					: // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
						normalizePathField(exportsRoot?.default?.default);

			// CJS-only packages should use default, not import or require.
			if (isCJSOnly) {
				const mainField = normalizePathField(json.main);
				if (defaultField !== mainField) {
					return `${json.name} is a CJS-only package. Incorrect 'default' entry in 'exports' field in package.json. Expected '${mainField}', got '${defaultField}'`;
				}
			}

			// ESM-only packages should use default, not import or require.
			if (isESMOnly) {
				const mainField = normalizePathField(json.main);
				if (defaultField !== mainField) {
					return `${json.name} is an ESM-only package. Incorrect 'default' entry in 'exports' field in package.json. Expected '${mainField}', got '${defaultField}'`;
				}
			}

			if (!isESMOnly && !isCJSOnly) {
				// ESM exports in import field
				const importField =
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					exportsRoot?.import?.default === undefined
						? undefined
						: // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
							normalizePathField(exportsRoot?.import?.default);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const moduleField = normalizePathField(json.module!);
				if (importField !== moduleField) {
					return `${json.name} has both CJS and ESM entrypoints. Incorrect 'import' entry in 'exports' field in package.json. Expected '${moduleField}', got '${importField}'`;
				}

				// CJS exports in require field
				const requireField =
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					exportsRoot?.require?.default === undefined
						? undefined
						: // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
							normalizePathField(exportsRoot?.require?.default);
				const mainField = normalizePathField(json.main);
				if (requireField !== mainField) {
					return `${json.name} has both CJS and ESM entrypoints. Incorrect 'require' entry in 'exports' field in package.json. Expected '${mainField}', got '${requireField}'`;
				}
			}
		},
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				if (shouldCheckExportsField(json)) {
					try {
						const exportsField = generateExportsField(json);
						json.exports = exportsField;
					} catch (error: unknown) {
						result.resolved = false;
						result.message = (error as Error).message;
					}
				}
			});

			return result;
		},
	},
	{
		// This rule enforces each exports type resolution (exported .d.ts file) is linted.
		name: "npm-package-exports-apis-linted",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			let packageJson: PackageJson;

			try {
				packageJson = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			// Only public packages' APIs must be linted
			if (packageJson.private ?? false) {
				return;
			}

			const { targetsImpacted } = await getApiLintElementsMissing(
				packageJson,
				path.dirname(file),
			);

			if (targetsImpacted.size > 0) {
				return `exports types files ${[...targetsImpacted].join(
					", ",
				)} should be linted by check:exports:* script using api-extractor.`;
			}
		},
		resolver: async (
			file: string,
			root: string,
		): Promise<{ resolved: boolean; message?: string }> => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			const dir = path.dirname(file);
			const pathToRoot = path.relative(dir, root);
			// <projectFolder> is used in path to allow config file to be located anywhere
			// within project (projectFolder = package.json directory).
			const commonApiLintConfig = `<projectFolder>/${path
				.join(pathToRoot, "common/build/build-common/api-extractor-lint.entrypoint.json")
				.replaceAll("\\", "/")}`;
			await updatePackageJsonFileAsync(dir, async (packageJson) => {
				try {
					const missingElements = await getApiLintElementsMissing(packageJson, dir);
					// 1. Fix config files.
					//    Config files are written first before any scripts are updated that
					//    would reference them. In case of failure, the package.json is not
					//    updated, which helps to avoid noise checking policy again.
					//    a. Make sure config directories exist using set of unique directories.
					const configDirs = new Set(
						[...missingElements.configFiles.keys()].map((configFile) =>
							path.dirname(configFile),
						),
					);
					await Promise.all(
						[...configDirs].map(async (configDir) =>
							fs.promises.mkdir(configDir, { recursive: true }),
						),
					);
					//    b. Write config files.
					await Promise.all(
						[...missingElements.configFiles.entries()].map(
							async ([configFile, mainEntryPointFilePath]) =>
								writeJson(
									configFile,
									{
										$schema:
											"https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
										extends: configFile.endsWith("-bundle.json")
											? commonApiLintConfig.replace(".entrypoint.json", ".json")
											: commonApiLintConfig,
										// <projectFolder> is used in place of . to allow
										// various config file locations. This replace()
										// also removes a possible `*|` prefix sentinel
										// for special bundle target.
										mainEntryPointFilePath: mainEntryPointFilePath.replace(
											/^(\*\|)?.\//,
											"<projectFolder>/",
										),
									},
									{ spaces: "\t" },
								),
						),
					);
					// 2. Fix devDependencies.
					if (missingElements.devDependencies.length > 0) {
						packageJson.devDependencies = packageJson.devDependencies ?? {};
						for (const devDep of missingElements.devDependencies) {
							// Ideally this would be set with version specified in neighbor
							// packages. Accept any version and let user set version.
							packageJson.devDependencies[devDep] = "*";
						}
						result.message = `Please set the version for the new devDependencies in ${packageJson.name}.`;
					}
					// 3. Fix scripts.
					//    Final step using all prior elements.
					for (const { name, commandLine } of missingElements.scriptEntries) {
						packageJson.scripts[name] = commandLine;
					}
				} catch (error: unknown) {
					result.resolved = false;
					result.message = (error as Error).message;
				}
			});

			return result;
		},
	},
	{
		/**
		 * Handler for {@link PolicyConfig.publicPackageRequirements}
		 */
		name: "npm-public-package-requirements",
		match,
		handler: async (
			packageJsonFilePath: string,
			rootDirectoryPath: string,
		): Promise<string | undefined> => {
			let packageJson: PackageJson;
			try {
				packageJson = JSON.parse(readFile(packageJsonFilePath)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${packageJsonFilePath}`;
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (packageJson.private) {
				// If the package is private, we have nothing to validate.
				return;
			}

			const requirements = getFlubConfig(rootDirectoryPath).policy?.publicPackageRequirements;
			if (requirements === undefined) {
				// If no requirements have been specified, we have nothing to validate.
				return;
			}

			const errors: string[] = [];

			// Ensure the package has all required dev dependencies specified in the config.
			if (requirements.requiredDevDependencies !== undefined) {
				const devDependencies = Object.keys(packageJson.devDependencies ?? {});
				for (const requiredDevDependency of requirements.requiredDevDependencies) {
					if (!devDependencies.includes(requiredDevDependency)) {
						errors.push(`Missing dev dependency: "${requiredDevDependency}"`);
					}
				}
			}

			// Ensure the package has all required scripts specified in the config.
			if (requirements.requiredScripts !== undefined) {
				const scriptNames = Object.keys(packageJson.scripts ?? {});
				for (const requiredScript of requirements.requiredScripts) {
					if (!scriptNames.includes(requiredScript.name)) {
						// Enforce the script is present
						errors.push(`Missing script: "${requiredScript.name}"`);
					} else if (
						requiredScript.bodyMustMatch === true &&
						packageJson.scripts[requiredScript.name] !== requiredScript.body
					) {
						// Enforce that script body matches policy
						errors.push(
							`Expected body of script "${requiredScript.name}" to be "${
								requiredScript.body
							}". Found "${packageJson.scripts[requiredScript.name]}".`,
						);
					}
				}
			}

			if (errors.length > 0) {
				return [`Policy violations for public package "${packageJson.name}":`, ...errors].join(
					`${newline}* `,
				);
			}
		},
		resolver: (
			packageJsonFilePath: string,
			rootDirectoryPath: string,
		): { resolved: boolean; message?: string } => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(packageJsonFilePath), (packageJson) => {
				// If the package is private, there is nothing to fix.
				if (packageJson.private === true) {
					return result;
				}

				const requirements =
					getFlubConfig(rootDirectoryPath).policy?.publicPackageRequirements;
				if (requirements === undefined) {
					// If no requirements have been specified, we have nothing to validate.
					return;
				}

				/**
				 * Updates the package.json contents to ensure the requirements of the specified script are met.
				 */
				function applyScriptCorrection(script: ScriptRequirement): void {
					// If the script is missing, or if it exists but its body doesn't satisfy the requirement,
					// apply the correct script configuration.
					if (
						packageJson.scripts[script.name] === undefined ||
						script.bodyMustMatch === true
					) {
						packageJson.scripts[script.name] = script.body;
					}
				}

				if (requirements.requiredScripts !== undefined) {
					// Ensure scripts body exists
					if (packageJson.scripts === undefined) {
						packageJson.scripts = {};
					}

					// Applies script corrections as needed for all script requirements
					// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference
					requirements.requiredScripts.forEach(applyScriptCorrection);
				}

				// If there are any missing required dev dependencies, report that the issues were not resolved (and
				// the dependencies need to be added manually).
				// TODO: In the future, we could consider having this code actually run the pnpm commands to install
				// the missing deps.
				if (requirements.requiredDevDependencies !== undefined) {
					const devDependencies = Object.keys(packageJson.devDependencies ?? {});
					for (const requiredDevDependency of requirements.requiredDevDependencies) {
						if (!devDependencies.includes(requiredDevDependency)) {
							result.resolved = false;
							break;
						}
					}
				}
			});

			return result;
		},
	},
	{
		name: "npm-check-unused-dependencies",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			const depcheckConfigFileName = ".depcheckrc.cjs";
			const packageDir = path.resolve(path.dirname(file));
			const depcheckConfigFilePath = path.resolve(
				path.join(packageDir, depcheckConfigFileName),
			);
			const configExists = fs.existsSync(depcheckConfigFilePath);
			let options: depcheck.Options = {};
			if (configExists) {
				try {
					options = require(depcheckConfigFilePath) as depcheck.Options;
				} catch (error) {
					console.log(`Error reading ${depcheckConfigFileName} file for ${packageDir}`, error);
					return;
				}
			}
			try {
				const result = await depcheck(packageDir, options);
				const packageErrors: string[] = [];
				if (result.devDependencies.length > 0) {
					packageErrors.push(`[Unused devDependencies]:${result.devDependencies.join(",")}`);
				}
				if (result.dependencies.length > 0) {
					packageErrors.push(`[Unused dependencies]:${result.dependencies.join(",")}`);
				}
				return packageErrors.length > 0 ? packageErrors.join(newline) : undefined;
			} catch (error) {
				return `Error running depcheck for ${packageDir}: ${error}`;
			}
		},
		resolver: async (
			file: string,
			_root: string,
			handlerOutput: string,
		): Promise<{ resolved: boolean; message?: string }> => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (packageJson) => {
				// Extract the errored dependencies from the error message output generated by the handler above.
				const [devDependencyErrorString, dependencyErrorString] = handlerOutput.split(newline);
				const devDependencyErroredPkgs = devDependencyErrorString?.split(":")[1]?.split(",");
				const dependencyErroredPkgs = dependencyErrorString?.split(":")[1]?.split(",");

				// Delete unused dev dependency declaration from package.json
				for (const pkgName of devDependencyErroredPkgs) {
					delete packageJson.devDependencies?.[pkgName];
				}
				// Delete unused dependency declaration from package.json
				for (const pkgName of dependencyErroredPkgs) {
					delete packageJson.dependencies?.[pkgName];
				}
			});

			return result;
		},
	},
];

function missingCleanDirectories(scripts: { [key: string]: string | undefined }): string[] {
	const expectedClean: string[] = [];

	if (scripts.tsc !== undefined) {
		expectedClean.push("dist");
	}

	// Using the heuristic that our package use "build:esnext" or "tsc:esnext" to indicate
	// that it has a ESM build.
	const esnextScriptsNames = ["build:esnext", "tsc:esnext"];
	const hasBuildEsNext = esnextScriptsNames.some((name) => scripts[name] !== undefined);
	if (hasBuildEsNext) {
		expectedClean.push("lib");
	}

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	if (scripts.build?.startsWith("fluid-build")) {
		expectedClean.push("*.tsbuildinfo", "*.build.log");
	}

	if (scripts["build:docs"] !== undefined) {
		expectedClean.push("_api-extractor-temp");
	}

	if (scripts.test !== undefined && !scripts.test.startsWith("echo")) {
		expectedClean.push("nyc");
	}
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	return expectedClean.filter((name) => !scripts.clean?.includes(name));
}

/**
 * Generates an 'exports' field for a package based on the value of other fields in package.json.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function generateExportsField(json: PackageJson) {
	if (json.types === undefined && json.typings === undefined) {
		throw new Error(
			"The 'types' and 'typings' field are both undefined. At least one must be defined (types is preferred).",
		);
	}

	if (json.main === undefined) {
		throw new Error("The 'main' field is undefined. It must have a value.");
	}

	// One of the values is guaranteed to be defined because of earlier checks
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const cjsTypes = normalizePathField((json.types ?? json.typings)!);

	const isCJSOnly = json.module === undefined || json.type === "commonjs";
	const isESMOnly = json.type === "module";

	if (isESMOnly) {
		return {
			".": {
				default: {
					// Assume the types field is the ESM types since this is an ESM-only package.
					types: cjsTypes,
					default: normalizePathField(json.main),
				},
			},
		};
	}

	if (isCJSOnly) {
		// This logic is the same as the ESM-only case, but it's separate intentionally to make it easier to refactor
		// as we learn more about what our exports field should look like for different package types.
		return {
			".": {
				default: {
					types: cjsTypes,
					default: normalizePathField(json.main),
				},
			},
		};
	}

	// Package has both CJS and ESM

	// Assume esm types are the same name as cjs, but in a different path.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- an earlier check guarantees module is defined
	const esmDir = path.dirname(json.module!);
	const typesFile = path.basename(cjsTypes.toString());
	const esmTypes = normalizePathField(path.join(esmDir, typesFile));

	const exports = {
		".": {
			import: {
				types: esmTypes,
				default: normalizePathField(json.module ?? json.main),
			},
			require: {
				types: cjsTypes,
				default: normalizePathField(json.main),
			},
		},
	};
	return exports;
}

/**
 * Returns true if the package should be checked for an exports field.
 */
function shouldCheckExportsField(json: PackageJson): boolean {
	if (
		// skip private packages
		json.private === true ||
		// and those with no main entrypoint
		json.main === undefined ||
		// packages with browser entrypoints require special attention, so ignoring here.
		json.browser !== undefined ||
		// skip if both the types/typings fields are missing
		(json.types === undefined && json.typings === undefined)
	) {
		return false;
	}
	return true;
}

/**
 * Normalizes a relative path value so it has a leading './'
 *
 * @remarks
 *
 * Does not work with absolute paths.
 */
function normalizePathField(pathIn: string): string {
	if (pathIn === "" || pathIn === undefined) {
		throw new Error(`Invalid path!`);
	}
	if (pathIn.startsWith("./")) {
		return pathIn;
	}
	return `./${pathIn}`;
}
