/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
} from "@fluid-tools/build-infrastructure";
import {
	FluidRepo,
	Package,
	PackageJson,
	TscUtils,
	getEsLintConfigFilePath,
	getFluidBuildConfig,
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
} from "@fluidframework/build-tools";
import JSON5 from "json5";
import * as semver from "semver";
import { TsConfigJson } from "type-fest";
import { getFlubConfig } from "../../config.js";
import { Handler, readFile } from "./common.js";
import { FluidBuildDatabase } from "./fluidBuildDatabase.js";

const require = createRequire(import.meta.url);

/**
 * Get and cache the tsc check ignore setting
 */
const fluidBuildTasksTscIgnoreTasksCache = new Map<string, Set<string>>();

const getFluidBuildTasksTscIgnore = (root: string): Set<string> => {
	const rootDir = path.resolve(root);
	let ignore = fluidBuildTasksTscIgnoreTasksCache.get(rootDir);
	if (ignore === undefined) {
		const ignoreArray = getFlubConfig(rootDir)?.policy?.fluidBuildTasks?.tsc?.ignoreTasks;
		ignore = ignoreArray ? new Set(ignoreArray) : new Set();
		fluidBuildTasksTscIgnoreTasksCache.set(rootDir, ignore);
	}
	return ignore;
};

/**
 * Cache the FluidRepo object, so we don't have to load it repeatedly
 */
const repoCache = new Map<string, { repo: FluidRepo; packageMap: Map<string, Package> }>();
function getFluidPackageMap(root: string): Map<string, Package> {
	const rootDir = path.resolve(root);
	let record = repoCache.get(rootDir);
	if (record === undefined) {
		const fluidBuildConfig = getFluidBuildConfig(rootDir);
		const repo = new FluidRepo(rootDir, fluidBuildConfig.repoPackages);
		const packageMap = repo.createPackageMap();
		record = { repo, packageMap };
		repoCache.set(rootDir, record);
	}
	return record.packageMap;
}

/**
 * Cache the FluidBuildDatabase to avoid rebuilding for different policies and handler versus resolver
 */
const fluidBuildDatabaseCache = new FluidBuildDatabase();

/**
 * Find script name for command in a npm package.json
 *
 * @param json - the package.json content to search script in
 * @param command - the command to find the script name for
 * @returns best script name found to match the command
 */
function findScript(json: Readonly<PackageJson>, command: string): string | undefined {
	if (json.scripts === undefined) {
		return undefined;
	}

	// Multiple scripts can have the same command, we want to find the best one.
	let bestScript: { rank: number; script: string | undefined } = {
		rank: 0,
		script: undefined,
	};
	for (const [script, commands] of Object.entries(json.scripts)) {
		if (commands === undefined) {
			continue;
		}
		const scriptCommands = commands.split("&&");
		for (const [index, scriptCommand] of scriptCommands.entries()) {
			if (command === scriptCommand.trim()) {
				// Rank better (lower) when there are fewer commands and the command is earlier
				// in the list.
				const rank = (index + 1) * scriptCommands.length;
				if (bestScript.script === undefined || rank < bestScript.rank) {
					bestScript = { rank, script };
				}
			}
		}
		// If we find an exact match, we can stop looking.
		if (bestScript.rank === 1) {
			return bestScript.script;
		}
	}
	return bestScript.script;
}

/**
 * Find the script name for the fluid-tsc command in a package.json
 *
 * @param json - the package.json content to search script in
 * @param project - the tsc project to check for; `undefined` checks for unspecified project
 * @returns first script name found to match the command
 *
 * @remarks
 */
function findFluidTscScript(
	json: Readonly<PackageJson>,
	project: string | undefined,
): string | undefined {
	for (const [script, scriptCommands] of Object.entries(json.scripts)) {
		if (scriptCommands === undefined) {
			continue;
		}

		if (
			scriptCommands.startsWith("fluid-tsc") &&
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			(project ? scriptCommands.includes(project) : !scriptCommands.includes("--project"))
		) {
			return script;
		}
	}
}

/**
 * Find the single tsc script in the package.json using given project.
 * Will throw if multiple scripts are found using same project file.
 * @param json - the package.json content to search
 * @param project - the tsc project to search for
 * @returns single script name found to use the project or undefined
 */
function findTscScript(json: Readonly<PackageJson>, project: string): string | undefined {
	const tscScripts: string[] = [];
	function addIfDefined(script: string | undefined): void {
		if (script !== undefined) {
			tscScripts.push(script);
		}
	}
	if (project === "./tsconfig.json") {
		addIfDefined(findScript(json, "tsc"));
		addIfDefined(findFluidTscScript(json, undefined));
	}
	addIfDefined(findScript(json, `tsc --project ${project}`));
	addIfDefined(findFluidTscScript(json, project));
	if (tscScripts.length === 1) {
		return tscScripts[0];
	}
	if (tscScripts.length === 0) {
		return undefined;
	}
	throw new Error(`'${project}' used in scripts '${tscScripts.join("', '")}'`);
}

// This should be TSESLint.Linter.Config or .ConfigType from @typescript-eslint/utils
// but that can only be used once this project is using Node16 resolution. PR #20972
// We could derive type from @typescript-eslint/eslint-plugin, but that it will add
// peer dependency requirements.
interface EslintConfig {
	parserOptions?: {
		// https://typescript-eslint.io/packages/parser/#project
		// eslint-disable-next-line @rushstack/no-new-null
		project?: string | string[] | boolean | null;
	};
}
/**
 * Get a list of build script names that the eslint depends on, based on .eslintrc file.
 * @remarks eslint does not depend on build tasks for the projects it references. (The
 * projects' configurations guide eslint typescript parser to use original typescript
 * source.) The packages that those projects depend on must be built. So effectively
 * eslint has the same prerequisites as the build tasks for the projects referenced.
 * @param packageDir - directory of the package
 * @param root - directory of the Fluid repo root
 * @param json - content of the package.json
 * @returns list of build script names that the eslint depends on
 */
async function eslintGetScriptDependencies(
	packageDir: string,
	root: string,
	json: Readonly<PackageJson>,
): Promise<(string | string[])[]> {
	if (json.scripts?.eslint === undefined) {
		return [];
	}

	const eslintConfig = getEsLintConfigFilePath(packageDir);
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	if (!eslintConfig) {
		throw new Error(`Unable to find eslint config file for package in ${packageDir}`);
	}

	let config: EslintConfig;
	try {
		const { ext } = path.parse(eslintConfig);
		if (ext === ".mjs") {
			throw new Error(`Eslint config '${eslintConfig}' is ESM; only CommonJS is supported.`);
		}

		if (ext !== ".js" && ext !== ".cjs") {
			// TODO: optimize double read for TscDependentTask.getDoneFileContent and there.
			const configFile = fs.readFileSync(eslintConfig, "utf8");
			config = JSON5.parse(configFile);
		} else {
			// This code assumes that the eslint config will be in CommonJS, because if it's ESM the require call will fail.
			config = require(path.resolve(eslintConfig)) as EslintConfig;
			if (config === undefined) {
				throw new Error(`Exports not found in ${eslintConfig}`);
			}
		}
	} catch (error) {
		throw new Error(`Unable to load eslint config file ${eslintConfig}. ${error}`);
	}

	let projects = config.parserOptions?.project;
	if (!Array.isArray(projects) && typeof projects !== "string") {
		// "config" is normally the raw configuration as file is on disk and has not
		// resolved and merged any extends specifications. So, "project" is what is
		// set in top file.
		if (projects === false || projects === null) {
			// type based linting is disabled - assume no task prerequisites
			return [];
		}
		// @typescript-eslint/parser allows true to mean use closest tsconfig.json, but we want
		// explicit listings for dependency clarity.
		if (projects === true) {
			throw new Error(
				`${json.name} eslint config's 'parserOptions' setting has 'project' set to 'true', which is unsupported by fluid-build. Please specify one or more tsconfig files instead.`,
			);
		}
		// projects === undefined, which @typescript-eslint/eslint-plugin handles by using
		// project path: ./tsconfig.json.
		projects = ["./tsconfig.json"];
	}
	const projectsArray = Array.isArray(projects) ? projects : [projects];

	// Get the build scripts for the projects
	const siblingTscScripts = projectsArray
		// Projects with ".lint." in the name are not required to have other associated tasks.
		.filter((project) => !project.includes(".lint."))
		.map((project) => {
			const found = findTscScript(json, project);

			if (found === undefined) {
				throw new Error(
					`Unable to find tsc script using project '${project}' specified in '${eslintConfig}' within package '${json.name}'`,
				);
			}

			return found;
		});
	if (siblingTscScripts.length === 0) {
		return [];
	}

	// Get the dependencies for the sibling tsc scripts that are the dependencies for eslint
	const packageMap = getFluidPackageMap(root);
	const emptyIgnoreSet = new Set<string>();
	const collectiveDependencies: (string | string[])[] = [];
	for (const script of siblingTscScripts) {
		const scriptCommands = json.scripts[script];
		if (scriptCommands === undefined) {
			throw new Error(
				`internal inconsistency - expected '${script}' not found in package '${json.name}'`,
			);
		}
		for (const commandUntrimmed of scriptCommands.split("&&")) {
			const command = commandUntrimmed.trim();
			if (shouldProcessScriptForTsc(script, command, emptyIgnoreSet)) {
				collectiveDependencies.push(
					...getTscCommandDependencies(packageDir, json, script, command, packageMap),
				);
			}
		}
	}
	return collectiveDependencies;
}

/**
 * Check if package has Fluid build enabled.
 * These are packages that are described in 'repoPackages' property in Fluid build config
 * and will be loaded with the FluidRepo object.
 *
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @returns true if FluidRepo includes the package, false otherwise
 */
function isFluidBuildEnabled(root: string, json: Readonly<PackageJson>): boolean {
	return getFluidPackageMap(root).get(json.name) !== undefined;
}

function getOrSet<T>(map: Map<string, T>, key: string, defaultValue: T): T {
	const value = map.get(key);
	if (value !== undefined) {
		return value;
	}
	map.set(key, defaultValue);
	return defaultValue;
}

/**
 * Check if a task has a specific dependency
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @param taskName - name of the task to check
 * @param searchDeps - list of any dependent to find.
 * @returns true if searchDep is found for task, false otherwise
 */
function hasTaskDependency(
	root: string,
	json: Readonly<PackageJson>,
	taskName: string,
	searchDeps: readonly string[],
): boolean {
	const rootConfig = getFluidBuildConfig(root);
	const globalTaskDefinitions = normalizeGlobalTaskDefinitions(rootConfig?.tasks);
	const taskDefinitions = getTaskDefinitions(json, globalTaskDefinitions, {
		isReleaseGroupRoot: false,
	});
	// Searched deps that are package specific (e.g. <packageName>#<taskName>)
	// It is expected that all packageNames are other packages' names; using
	// given package's name (json.name) will alway return false as package is
	// not a dependency of itself. Skip "name# prefix for self dependencies.
	const packageSpecificSearchDeps = searchDeps.filter((d) => d.includes("#"));
	const secondaryPackagesTasksToConsider = new Map<
		string,
		{ searchDeps: string[]; tasks: Set<string> }
	>();
	for (const d of packageSpecificSearchDeps) {
		const [pkg, task] = d.split("#");
		getOrSet(secondaryPackagesTasksToConsider, pkg, {
			searchDeps: [],
			tasks: new Set<string>(),
		}).searchDeps.push(task);
	}
	/**
	 * Set of package dependencies
	 */
	const packageDependencies = new Set([
		...Object.keys(json.dependencies ?? {}),
		// devDeps are not regular task deps, but might happen for internal type only packages.
		...Object.keys(json.devDependencies ?? {}),
		...Object.keys(json.peerDependencies ?? {}),
	]);
	const seenDep = new Set<string>();
	const pending: string[] = [];
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	if (taskDefinitions[taskName]) {
		pending.push(...taskDefinitions[taskName].dependsOn);
	}

	while (pending.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const dep = pending.pop()!;
		if (seenDep.has(dep)) {
			// This could be repeats or circular dependency (which we are not trying to detect)
			continue;
		}
		seenDep.add(dep);
		if (searchDeps.includes(dep)) {
			return true;
		}
		if (dep.startsWith("^")) {
			// ^ means "depends on the task of the same name in all package dependencies".
			// dep of exactly ^* means "_all_ tasks in all package dependencies".
			const depPattern = dep.slice(1);
			const regexSearchMatches = new RegExp(depPattern === "*" ? "." : `#${depPattern}$`);
			// Check for task matches
			const possibleSearchMatches = packageSpecificSearchDeps.filter((searchDep) =>
				regexSearchMatches.test(searchDep),
			);
			// Check if there is matching dependency
			if (
				possibleSearchMatches.some((searchDep) =>
					packageDependencies.has(searchDep.split("#")[0]),
				)
			) {
				return true;
			}
			if (depPattern === "*") {
				// No possible match even through transitive dependencies since
				// ^* would already consider all tasks in all dependencies.
				continue;
			}
			for (const [packageName, secondaryData] of secondaryPackagesTasksToConsider) {
				// If there is a matching dependency package, add this task to
				// transitive dependency in secondary package search list.
				if (packageDependencies.has(packageName)) {
					secondaryData.tasks.add(depPattern);
				}
			}
			continue;
		}
		const packageDepMatch = dep.match(/^([^#]*)#(.*)$/);
		if (packageDepMatch) {
			// Consider one level deep of package's tasks to handle multi-task dependencies.
			const secondaryPackageSet = secondaryPackagesTasksToConsider.get(packageDepMatch[1]);
			if (secondaryPackageSet) {
				secondaryPackageSet.tasks.add(packageDepMatch[2]);
			}
		} else {
			// Do expand transitive dependencies and child tasks from local tasks.
			const taskDef = taskDefinitions[dep];
			if (taskDef !== undefined) {
				pending.push(...taskDef.dependsOn, ...taskDef.children);
			}
		}
	}

	// Consider secondary package dependencies transitive dependencies
	const packageMap = getFluidPackageMap(root);
	for (const [packageName, secondaryData] of secondaryPackagesTasksToConsider.entries()) {
		const pkgJson = packageMap.get(packageName)?.packageJson;
		if (pkgJson === undefined) {
			throw new Error(`Dependent package ${packageName} not found in repo`);
		}
		const secondaryTaskDefinitions = getTaskDefinitions(pkgJson, globalTaskDefinitions, {
			isReleaseGroupRoot: false,
		});
		pending.push(...secondaryData.tasks);
		let dep;
		while ((dep = pending.pop()) !== undefined) {
			if (secondaryData.searchDeps.includes(dep)) {
				return true;
			}
			const taskDef = secondaryTaskDefinitions[dep];
			if (taskDef !== undefined) {
				pending.push(...taskDef.dependsOn, ...taskDef.children);
			}
		}
	}

	return false;
}

/**
 * Check the actual dependencies of a task against an expected set of dependent tasks
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @param taskName - task name to check the actual dependent tasks for
 * @param taskDeps - array of expected dependent tasks
 * @returns message describing the missing dependencies
 */
function checkTaskDeps(
	root: string,
	json: Readonly<PackageJson>,
	taskName: string,
	taskDeps: readonly (string | string[])[],
): string | undefined {
	const missingTaskDependencies = taskDeps
		.filter(
			(taskDep) =>
				!hasTaskDependency(root, json, taskName, Array.isArray(taskDep) ? taskDep : [taskDep]),
		)
		.map((dep) => (Array.isArray(dep) ? dep.join(" or ") : dep));

	return missingTaskDependencies.length > 0
		? `'${taskName}' task is missing the following dependency: \n\t${missingTaskDependencies.join(
				"\n\t",
			)}`
		: undefined;
}

/**
 * Recursive inverse of Readonly
 * Makes all properties writeable through entire structure.
 */
type DeeplyMutable<T> = { -readonly [K in keyof T]: DeeplyMutable<T[K]> };

/**
 * Reinterprets a readonly object as a mutable object
 */
function asWriteable<T>(onlyReadable: T): DeeplyMutable<T> {
	return onlyReadable as DeeplyMutable<T>;
}

/**
 * Fix up the actual dependencies of a task against an expected set of dependent tasks
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @param taskName - task name to check the actual dependent tasks for
 * @param taskDeps - array of expected dependent tasks
 * @returns json object is modified to include the expected task dependencies
 */
function patchTaskDeps(
	root: string,
	json: PackageJson,
	taskName: string,
	taskDeps: readonly (string | string[])[],
): void {
	const missingTaskDependencies = taskDeps.filter(
		(taskDep) =>
			!hasTaskDependency(root, json, taskName, Array.isArray(taskDep) ? taskDep : [taskDep]),
	);

	if (missingTaskDependencies.length > 0) {
		const readonlyFileDep = json.fluidBuild?.tasks?.[taskName];
		if (readonlyFileDep === undefined) {
			let tasks: DeeplyMutable<
				Exclude<Exclude<PackageJson["fluidBuild"], undefined>["tasks"], undefined>
			>;
			if (json.fluidBuild === undefined) {
				tasks = {};
				json.fluidBuild = { tasks, version: 1 };
			} else if (json.fluidBuild.tasks === undefined) {
				tasks = {};
				json.fluidBuild.tasks = tasks;
			} else {
				tasks = asWriteable(json.fluidBuild.tasks);
			}

			tasks[taskName] = taskDeps.map((dep) => {
				if (Array.isArray(dep)) {
					throw new TypeError(
						`build-cli patchTaskDeps for ${taskName} will not auto select single dependency from choice of ${dep.join(
							" or ",
						)}`,
					);
				}
				return dep;
			});
		} else {
			const fileDep = asWriteable(readonlyFileDep);
			let depArray: string[];
			if (Array.isArray(fileDep)) {
				depArray = fileDep;
			} else if (fileDep.dependsOn === undefined) {
				depArray = [];
				fileDep.dependsOn = depArray;
			} else {
				depArray = fileDep.dependsOn;
			}
			for (const missingDep of missingTaskDependencies) {
				if (Array.isArray(missingDep)) {
					throw new TypeError(
						`build-cli patchTaskDeps for ${taskName} will not auto select single dependency from choice of ${missingDep.join(
							" or ",
						)}`,
					);
				}
				// Check if already added in previous iteration to avoid duplicates.
				if (!depArray.includes(missingDep)) {
					depArray.push(missingDep);
				}
			}
		}
	}
}

function getTscCommandDependencies(
	packageDir: string,
	json: Readonly<PackageJson>,
	script: string,
	command: string,
	packageMap: ReadonlyMap<string, Package>,
): (string | string[])[] {
	// If the project has a referenced project, depend on that instead of the default
	const parsedCommand = TscUtils.parseCommandLine(command);
	if (!parsedCommand) {
		throw new Error(`Error parsing tsc command for script '${script}': ${command}`);
	}
	const configFile = TscUtils.findConfigFile(packageDir, parsedCommand);
	const configJson = TscUtils.readConfigFile(configFile) as TsConfigJson;
	if (configJson === undefined) {
		throw new Error(`Failed to load config file '${configFile}'`);
	}

	const deps: (string | string[])[] = [];
	// Assume that we are building test ts files either in tsc or build:esnext if build:test
	// doesn't exist. Make sure the order is encoded
	if (
		json.scripts["build:test"] === undefined &&
		json.scripts["typetests:gen"] !== undefined &&
		(script === "tsc" || (json.scripts.tsc === undefined && script === "build:esnext"))
	) {
		deps.push("typetests:gen");
	}
	if (configJson.references) {
		const configFilePath = path.dirname(configFile);

		// Strictly speaking tsc project references would build the referenced projects as needed,
		// but with parallel builds we want to ensure referenced projects are built first (and not
		// simultaneously). So we add the referenced projects as dependencies.
		for (const ref of configJson.references) {
			let refConfigPath = path.join(configFilePath, ref.path);
			const fileInfo = fs.statSync(refConfigPath);
			if (fileInfo.isDirectory()) {
				refConfigPath = path.join(refConfigPath, "tsconfig.json");
			}
			// Environment path separator may be \, but find helpers all do
			// simple string comparisons where paths are expected to use /.
			// So, ensure search project is set with only / separators.
			refConfigPath = TscUtils.normalizeSlashes(
				`./${path.relative(packageDir, refConfigPath)}`,
			);

			const referencedScript = findTscScript(json, refConfigPath);
			if (referencedScript === undefined) {
				throw new Error(`Unable to find tsc script for referenced project ${refConfigPath}`);
			}
			deps.push(referencedScript);
		}
	}

	const curPkgRepoGroup = packageMap.get(json.name)?.group;
	const tscPredecessors = fluidBuildDatabaseCache.getPossiblePredecessorTasks(
		packageMap,
		json.name,
		script,
		// ignore filter function
		(depSpec: { name: string; version: string }) => {
			// Never ignore workspace linked dependencies
			if (depSpec.version.includes("workspace:")) {
				return false;
			}
			// Historically, a semantic version check was also considered sufficient
			// to indicate a possible dependency. This was probably the case for lerna
			// managed repo. The check is preserved here, but only allowed when the
			// packages are within the same release group.
			// Note: packages may be symlinked across workspace boundaries and in those
			// situations, it is up to the user to build in the correct order. To enact
			// a full repo ordering, support would be needed to recognize tooling
			// dependencies used to run scripts apart from compile time dependencies,
			// especially since the module type is irrelevant for execution dependencies.
			const depPackage = packageMap.get(depSpec.name);
			if (depPackage === undefined) {
				// Not known to repo, can be ignored.
				return true;
			}
			if (depPackage.group !== curPkgRepoGroup) {
				return true;
			}
			const satisfied = semver.satisfies(depPackage.version, depSpec.version);
			return !satisfied;
		},
	);

	// eslint-disable-next-line unicorn/prefer-spread
	return deps.concat(
		[...tscPredecessors].map((group) =>
			group.map((predecessor) => `${predecessor.packageName}#${predecessor.script}`),
		),
	);
}

interface BuildDepsCallbackContext {
	packageDir: string;
	json: PackageJson;
	script: string;
	command: string;
	packageMap: ReadonlyMap<string, Package>;
	root: string;
}

function buildDepsHandler(
	file: string,
	root: string,
	check: (context: BuildDepsCallbackContext) => string | undefined,
): string | undefined {
	let json: PackageJson;
	try {
		json = JSON.parse(readFile(file)) as PackageJson;
	} catch {
		return `Error parsing JSON file: ${file}`;
	}

	if (!isFluidBuildEnabled(root, json)) {
		return;
	}
	if (json.scripts === undefined) {
		return;
	}
	const packageDir = path.dirname(file);
	const errors: string[] = [];
	const packageMap = getFluidPackageMap(root);
	const ignore = getFluidBuildTasksTscIgnore(root);
	for (const [script, scriptCommands] of Object.entries(json.scripts)) {
		if (scriptCommands === undefined) {
			continue;
		}
		for (const commandUntrimmed of scriptCommands.split("&&")) {
			const command = commandUntrimmed.trim();
			if (!shouldProcessScriptForTsc(script, command, ignore)) {
				continue;
			}
			try {
				const error = check({ packageDir, json, script, command, packageMap, root });
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				if (error) {
					errors.push(error);
				}
			} catch (error: unknown) {
				return (error as Error).message;
			}
		}
	}
	return errors.length > 0 ? errors.join("\n") : undefined;
}

function checkTscDependencies({
	packageDir,
	json,
	script,
	command,
	packageMap,
	root,
}: BuildDepsCallbackContext): string | undefined {
	const checkDeps = getTscCommandDependencies(packageDir, json, script, command, packageMap);
	// Check the dependencies
	return checkTaskDeps(root, json, script, checkDeps);
}

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
	{
		name: "fluid-build-tasks-eslint",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${file}`;
			}

			if (!isFluidBuildEnabled(root, json)) {
				return;
			}
			try {
				const scriptDeps = await eslintGetScriptDependencies(path.dirname(file), root, json);
				return checkTaskDeps(root, json, "eslint", scriptDeps);
			} catch (error: unknown) {
				return (error as Error).message;
			}
		},
		resolver: async (
			file: string,
			root: string,
		): Promise<{ resolved: boolean; message?: string }> => {
			let result: { resolved: boolean; message?: string } = { resolved: true };
			await updatePackageJsonFileAsync(path.dirname(file), async (json) => {
				if (!isFluidBuildEnabled(root, json)) {
					return;
				}
				try {
					const scriptDeps = await eslintGetScriptDependencies(path.dirname(file), root, json);
					patchTaskDeps(root, json, "eslint", scriptDeps);
				} catch (error: unknown) {
					result = { resolved: false, message: (error as Error).message };
				}
			});
			return result;
		},
	},
	{
		/**
		 * Checks that all tsc project files (tsconfig.json), are only used once as the main
		 * configuration among scripts.
		 * Multiple uses may indicate a collision during build.
		 */
		name: "tsc-project-single-use",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			const projectMap = new Map<string, string>();
			return buildDepsHandler(
				file,
				root,
				({ packageDir, script, command }: BuildDepsCallbackContext) => {
					// If the project has a referenced project, depend on that instead of the default
					const parsedCommand = TscUtils.parseCommandLine(command);
					if (!parsedCommand) {
						throw new Error(`Error parsing tsc command for script '${script}': ${command}`);
					}
					const configFile = TscUtils.findConfigFile(packageDir, parsedCommand);
					const previousUse = projectMap.get(configFile);
					if (previousUse !== undefined) {
						return `'${previousUse}' and '${script}' tasks share use of ${configFile}`;
					}
					projectMap.set(configFile, script);
				},
			);
		},
	},
	{
		name: "fluid-build-tasks-tsc",
		match,
		handler: async (file: string, root: string) =>
			buildDepsHandler(file, root, checkTscDependencies),
		resolver: (file: string, root: string): { resolved: boolean; message?: string } => {
			let result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				if (!isFluidBuildEnabled(root, json)) {
					return;
				}

				const packageDir = path.dirname(file);
				const packageMap = getFluidPackageMap(root);
				const ignore = getFluidBuildTasksTscIgnore(root);
				for (const [script, scriptCommands] of Object.entries(json.scripts)) {
					if (scriptCommands === undefined) {
						continue;
					}
					for (const commandUntrimmed of scriptCommands.split("&&")) {
						const command = commandUntrimmed.trim();
						if (shouldProcessScriptForTsc(script, command, ignore)) {
							try {
								const checkDeps = getTscCommandDependencies(
									packageDir,
									json,
									script,
									command,
									packageMap,
								);
								patchTaskDeps(root, json, script, checkDeps);
							} catch (error: unknown) {
								result = { resolved: false, message: (error as Error).message };
								return;
							}
						}
					}
				}
			});
			return result;
		},
	},
];

/**
 * Helper to determine if a script/command should be processed by the handler for tsc fluid-build tasks.
 * @param script - The name of the npm script in package.json.
 * @param command - The command that the npm script executes.
 * @param tasksToIgnore - List of fluid-build tasks (usually npm scripts) that should be ignored.
 * @returns true if script/command should be processed by the handler for tsc fluid-build tasks
 */
function shouldProcessScriptForTsc(
	script: string,
	command: string,
	tasksToIgnore: Set<string>,
): boolean {
	return (
		// This clause ensures we don't match commands that are prefixed with "tsc", like "tsc-multi". The exception
		// is when the whole command is "tsc".
		(command.startsWith("tsc ") || command === "tsc" || command.startsWith("fluid-tsc ")) &&
		// tsc --watch tasks are long-running processes and don't need the standard task deps
		!command.includes("--watch") &&
		!tasksToIgnore.has(script)
	);
}
