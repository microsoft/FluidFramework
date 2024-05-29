/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable prefer-object-has-own */

import * as child_process from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { EOL as newline } from "node:os";
import path from "node:path";
import * as readline from "node:readline";
import replace from "replace-in-file";
import sortPackageJson from "sort-package-json";

import {
	PackageJson,
	PackageNamePolicyConfig,
	ScriptRequirement,
	loadFluidBuildConfig,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";
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
	const config = loadFluidBuildConfig(root).policy?.packageNames;

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
	const config = loadFluidBuildConfig(root).policy?.packageNames;

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
	const config = loadFluidBuildConfig(root).policy?.packageNames;

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
function ensurePrivatePackagesComputed(): Set<string> {
	if (computedPrivatePackages) {
		return computedPrivatePackages;
	}

	const newPrivatePackages = new Set<string>();
	const pathToGitRoot = child_process
		.execSync("git rev-parse --show-cdup", { encoding: "utf8" })
		.trim();
	const p = child_process.spawn("git", [
		"ls-files",
		"-co",
		"--exclude-standard",
		"--full-name",
		"**/package.json",
	]);
	const lineReader = readline.createInterface({
		input: p.stdout,
		terminal: false,
	});

	lineReader.on("line", (line) => {
		const filePath = path.join(pathToGitRoot, line).trim().replace(/\\/g, "/");
		if (fs.existsSync(filePath)) {
			const packageJson = JSON.parse(readFile(filePath)) as PackageJson;
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (packageJson.private) {
				newPrivatePackages.add(packageJson.name);
			}
		}
	});

	computedPrivatePackages = newPrivatePackages;
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
			} else if (json.repository?.url !== repository) {
				ret.push(`repository.url: "${json.repository.url}" !== "${repository}"`);
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
		resolver: (file: string, root: string): { resolved: boolean } => {
			updatePackageJsonFile(path.dirname(file), (json) => {
				json.author = author;
				json.license = licenseId;

				if (json.repository === undefined || typeof json.repository === "string") {
					json.repository = {
						type: "git",
						url: repository,
						directory: path.posix.relative(root, path.dirname(file)),
					};
				}

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

			const privatePackages = ensurePrivatePackagesComputed();
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
			const manifest = loadFluidBuildConfig(root);
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
						json.dependencies?.[dep] === undefined &&
						json.devDependencies?.[dep] === undefined
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

			const requirements =
				loadFluidBuildConfig(rootDirectoryPath).policy?.publicPackageRequirements;
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
					loadFluidBuildConfig(rootDirectoryPath).policy?.publicPackageRequirements;
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
