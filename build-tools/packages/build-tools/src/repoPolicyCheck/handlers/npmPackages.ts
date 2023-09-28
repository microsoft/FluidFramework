/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as child_process from "child_process";
import fs from "fs";
import { EOL as newline } from "os";
import path from "path";
import * as readline from "readline";
import replace from "replace-in-file";
import sortPackageJson from "sort-package-json";

import { updatePackageJsonFile } from "../../common/npmPackage";
import { getFluidBuildConfig } from "../../common/fluidUtils";
import { Handler, readFile, writeFile } from "../common";
import { PackageNamePolicyConfig } from "../../common/fluidRepo";

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
export function packageMustPublishToNPM(name: string, config: PackageNamePolicyConfig): boolean {
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
	const config = getFluidBuildConfig(root).policy?.packageNames;

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
	const config = getFluidBuildConfig(root).policy?.packageNames;

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
	const config = getFluidBuildConfig(root).policy?.packageNames;

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

function ensurePrivatePackagesComputed(): void {
	if (privatePackages) {
		return;
	}

	privatePackages = new Set();
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
			const packageJson = JSON.parse(readFile(filePath));
			if (packageJson.private) {
				privatePackages.add(packageJson.name);
			}
		}
	});
}

let privatePackages: Set<string>;

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
	{
		name: "npm-package-metadata-and-sorting",
		match,
		handler: (file) => {
			let jsonStr: string;
			let json;
			try {
				jsonStr = readFile(file);
				json = JSON.parse(jsonStr);
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const ret: string[] = [];

			if (JSON.stringify(sortPackageJson(json)) != JSON.stringify(json)) {
				ret.push(`package.json not sorted`);
			}

			if (json.author !== author) {
				ret.push(`author: "${json.author}" !== "${author}"`);
			}

			if (json.license !== licenseId) {
				ret.push(`license: "${json.license}" !== "${licenseId}"`);
			}

			if (!json.repository) {
				ret.push(`repository field missing`);
			} else if (typeof json.repository === "string") {
				ret.push(`repository should be an object, not a string`);
			} else if (json.repository?.url !== repository) {
				ret.push(`repository.url: "${json.repository.url}" !== "${repository}"`);
			}

			if (!json.private && !json.description) {
				ret.push("description: must not be empty");
			}

			if (json.homepage !== homepage) {
				ret.push(`homepage: "${json.homepage}" !== "${homepage}"`);
			}

			if (ret.length > 1) {
				return `${ret.join(newline)}`;
			} else if (ret.length === 1) {
				return ret[0];
			}

			return undefined;
		},
		resolver: (file, root) => {
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
		handler: (file, root) => {
			let json: { name: string };
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			// "root" is the package name for monorepo roots, so ignore them
			if (!packageIsFluidPackage(json.name, root) && json.name !== "root") {
				const matched = json.name.match(/^(@.+)\//);
				if (matched !== null) {
					return `Scope ${matched[1]} is an unexpected Fluid scope`;
				} else {
					return `Package ${json.name} is an unexpected unscoped package`;
				}
			}
		},
	},
	{
		// Verify that packages are correctly marked private or not.
		// Also verify that non-private packages don't take dependencies on private packages.
		name: "npm-private-packages",
		match,
		handler: (file, root) => {
			let json: { name: string; private?: boolean; dependencies: Record<string, string> };
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			ensurePrivatePackagesComputed();
			const errors: string[] = [];

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
		handler: (file) => {
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);

			if (!readmeInfo.exists) {
				return `Package directory ${packageDir} contains no README.md`;
			} else if (readmeInfo.title !== packageName) {
				// These packages don't follow the convention of starting the readme with "# PackageName"
				const skip = ["root", "fluid-docs"].some((skipMe) => packageName === skipMe);
				if (!skip) {
					return `Readme in package directory ${packageDir} should begin with heading "${json.name}"`;
				}
			}

			if (fs.existsSync(path.join(packageDir, "Dockerfile"))) {
				if (!readmeInfo.trademark) {
					return `Readme in package directory ${packageDir} with Dockerfile should contain with trademark verbiage`;
				}
			}
		},
		resolver: (file) => {
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return { resolved: false, message: "Error parsing JSON file: " + file };
			}

			const packageName = json.name;
			const packageDir = path.dirname(file);
			const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);
			const expectedTitle = `# ${json.name}`;
			const expectTrademark = fs.existsSync(path.join(packageDir, "Dockerfile"));
			if (!readmeInfo.exists) {
				if (expectTrademark) {
					writeFile(
						readmeInfo.filePath,
						`${expectedTitle}${newline}${newline}${trademark}`,
					);
				} else {
					writeFile(readmeInfo.filePath, `${expectedTitle}${newline}`);
				}
				return { resolved: true };
			}

			const fixTrademark =
				!readmeInfo.trademark && !readmeInfo.readme.includes("## Trademark");
			if (fixTrademark) {
				const existingNewLine = readmeInfo.readme[readmeInfo.readme.length - 1] === "\n";
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
		handler: (file) => {
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
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
				const skip = ["root"].some((skipMe) => packageName === skipMe);
				if (!skip) {
					return `Containing folder ${folderName} for package ${packageName} should be named similarly to the package`;
				}
			}
		},
	},
	{
		name: "npm-package-license",
		match,
		handler: (file, root) => {
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

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
		resolver: (file, root) => {
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
		handler: (file) => {
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
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
				const hasFormatScript = Object.prototype.hasOwnProperty.call(
					json.scripts,
					"format",
				);
				const isLernaFormat = json["scripts"]["format"]?.includes("lerna");

				if (!isLernaFormat) {
					if (hasPrettierScript || hasPrettierFixScript || hasFormatScript) {
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
			}

			return missingScripts.length > 0
				? `${file} is missing the following scripts: ${missingScripts.join("\n\t")}`
				: undefined;
		},
		resolver: (file) => {
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

						if (json.scripts !== undefined && !formatScript) {
							json.scripts.format = "npm run prettier:fix";

							if (!prettierScript) {
								json.scripts.prettier = "prettier --check .";
							}

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
		handler: (file) => {
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
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
		handler: (file, root) => {
			const manifest = getFluidBuildConfig(root);
			const commandPackages = manifest.policy?.dependencies?.commandPackages;
			if (commandPackages === undefined) {
				return;
			}
			const commandDep = new Map(commandPackages);
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const hasScriptsField = Object.prototype.hasOwnProperty.call(json, "scripts");
			const missingDeps: string[] = [];

			if (hasScriptsField) {
				const commands = new Set(
					Object.values(json.scripts as string[]).map((s) => s.split(" ")[0]),
				);
				for (const command of commands.values()) {
					const dep = commandDep.get(command);
					if (
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
		name: "npm-package-json-test-scripts",
		match,
		handler: (file, root) => {
			// This rules enforces that if the package have test files (in 'src/test', excluding 'src/test/types'),
			// or mocha/jest dependencies, it should have a test scripts so that the pipeline will pick it up

			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const packageDir = path.dirname(file);
			const scripts = json.scripts;
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
						(e) =>
							path.extname(e.name) === ".ts" ||
							(e.isDirectory() && e.name !== "types"),
					)
				) {
					return "Test files exists but no test scripts";
				}
			}

			const dep = ["mocha", "@types/mocha", "jest", "@types/jest"];
			if (
				(json.dependencies &&
					Object.keys(json.dependencies).some((name) => dep.includes(name))) ||
				(json.devDependencies &&
					Object.keys(json.devDependencies).some((name) => dep.includes(name)))
			) {
				return `Package has one of "${dep.join()}" dependency but no test scripts`;
			}
		},
	},
	{
		name: "npm-package-json-test-scripts-split",
		match,
		handler: (file, root) => {
			// This rule enforces that because the pipeline split running these test in different steps, each project
			// has the split set up property (into test:mocha, test:jest and test:realsvc). Release groups that don't
			// have splits in the pipeline is excluded in the "handlerExclusions" in the fluidBuild.config.cjs
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const scripts = json.scripts;
			if (scripts === undefined) {
				return undefined;
			}
			const testScript = scripts["test"];

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
		handler: (file, root) => {
			// This rule enforces that mocha will use a config file and setup both the console, json and xml reporters.
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const scripts = json.scripts;
			if (scripts === undefined) {
				return undefined;
			}
			const mochaScriptName = scripts["test:mocha"] !== undefined ? "test:mocha" : "test";
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

			if (mochaRcName === undefined) {
				if (!mochaScript.includes(" --config ")) {
					return "Missing config arguments";
				}
			}
		},
	},

	{
		name: "npm-package-json-script-jest-config",
		match,
		handler: (file, root) => {
			// This rule enforces that jest will use a config file and setup both the default (console) and junit reporters.
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const scripts = json.scripts;
			if (scripts === undefined) {
				return undefined;
			}
			const jestScriptName = scripts["test:jest"] !== undefined ? "test:jest" : "test";
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
			const config = require(path.resolve(jestConfigFile));
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

			if (json["jest-junit"] !== undefined) {
				return `Extraneous jest-unit config in ${file}`;
			}
		},
	},
	{
		name: "npm-package-json-esm",
		match,
		handler: (file, root) => {
			// This rule enforces that we have a module field in the package iff we have a ESM build
			// So that tools like webpack will pack up the right version.
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const scripts = json.scripts;
			if (scripts === undefined) {
				return undefined;
			}
			// Using the heuristic that our package use "build:esnext" or "tsc:esnext" to indicate
			// that it has a ESM build.
			const esnextScriptsNames = ["build:esnext", "tsc:esnext"];
			const hasBuildEsNext = esnextScriptsNames.some((name) => scripts[name] !== undefined);
			const hasModuleOutput = json.module !== undefined;

			if (hasBuildEsNext) {
				if (!hasModuleOutput) {
					return "Missing 'module' field in package.json for ESM build";
				}
			} else {
				// If we don't have a separate esnext build, it's still ok to have the "module"
				// field if it is the same as "main"
				if (hasModuleOutput && json.main !== json.module) {
					return "Missing ESM build script while package.json has 'module' field";
				}
			}
		},
	},
	{
		name: "npm-package-json-clean-script",
		match,
		handler: (file, root) => {
			// This rule enforces the "clean" script will delete all the build and test output
			let json;

			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			const scripts = json.scripts;
			if (scripts === undefined) {
				return undefined;
			}

			const cleanScript = scripts.clean;
			if (cleanScript) {
				// Ignore clean scripts that are root of the release group
				if (cleanScript.startsWith("pnpm")) {
					return undefined;
				}

				// Enforce clean script prefix
				if (!cleanScript.startsWith("rimraf --glob ")) {
					return "'clean' script should start with 'rimraf --glob'";
				}
			}

			const missing = missingCleanDirectories(scripts);

			if (missing.length !== 0) {
				return `'clean' script missing the following:${missing
					.map((i) => `\n\t${i}`)
					.join("")}`;
			}

			const clean = scripts["clean"];
			if (clean && clean.startsWith("rimraf ")) {
				if (clean.includes('"')) {
					return "'clean' script using double quotes instead of single quotes";
				}

				if (!clean.includes("'")) {
					return "'clean' script rimraf argument should have single quotes";
				}
			}
		},
		resolver: (file, root) => {
			const result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				const missing = missingCleanDirectories(json.scripts);
				const clean = json.scripts["clean"] ?? "rimraf --glob";
				if (clean.startsWith("rimraf --glob")) {
					result.resolved = false;
					result.message =
						"Unable to fix 'clean' script that doesn't start with 'rimraf --glob'";
				}
				if (missing.length === 0) {
					return;
				}
				json.scripts["clean"] = `${clean} ${missing.map((name) => `'${name}'`).join(" ")}`;
			});

			return result;
		},
	},
];

function missingCleanDirectories(scripts: any) {
	const expectedClean: string[] = [];

	if (scripts["tsc"]) {
		expectedClean.push("dist");
	}

	// Using the heuristic that our package use "build:esnext" or "tsc:esnext" to indicate
	// that it has a ESM build.
	const esnextScriptsNames = ["build:esnext", "tsc:esnext"];
	const hasBuildEsNext = esnextScriptsNames.some((name) => scripts[name] !== undefined);
	if (hasBuildEsNext) {
		expectedClean.push("lib");
	}

	if (scripts["build"]?.startsWith("fluid-build")) {
		expectedClean.push("*.tsbuildinfo");
		expectedClean.push("*.build.log");
	}

	if (scripts["build:docs"]) {
		expectedClean.push("_api-extractor-temp");
	}

	if (scripts["test"] && !scripts["test"].startsWith("echo")) {
		expectedClean.push("nyc");
	}
	return expectedClean.filter((name) => !scripts.clean?.includes(name));
}
