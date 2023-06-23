/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from "fs";
import path from "path";
import * as JSON5 from "json5";
import * as semver from "semver";
import { Package, PackageJson, updatePackageJsonFile } from "../../common/npmPackage";
import { getTaskDefinitions } from "../../common/fluidTaskDefinitions";
import { getEsLintConfigFilePath } from "../../common/taskUtils";
import { FluidRepo } from "../../common/fluidRepo";
import { getFluidBuildConfig } from "../../common/fluidUtils";
import * as TscUtils from "../../common/tscUtils";
import { Handler, readFile } from "../common";

/**
 * Get and cache the tsc check ignore setting
 */
const fluidBuildTasksTscIgnoreTasksCache = new Map<string, Set<string>>();

const getFluidBuildTasksTscIgnore = (root: string) => {
	const rootDir = path.resolve(root);
	let ignore = fluidBuildTasksTscIgnoreTasksCache.get(rootDir);
	if (ignore === undefined) {
		const ignoreArray = getFluidBuildConfig(rootDir)?.policy?.fluidBuildTasks?.tsc?.ignoreTasks;
		ignore = ignoreArray ? new Set(ignoreArray) : new Set();
		fluidBuildTasksTscIgnoreTasksCache.set(rootDir, ignore);
	}
	return ignore;
};

const fluidBuildTasksTscIgnoreDependenciesCache = new Map<string, Set<string>>();
const getFluidBuildTasksIgnoreDependencies = (root: string) => {
	const rootDir = path.resolve(root);
	let ignore = fluidBuildTasksTscIgnoreDependenciesCache.get(rootDir);
	if (ignore === undefined) {
		const ignoreArray =
			getFluidBuildConfig(rootDir)?.policy?.fluidBuildTasks?.tsc?.ignoreDependencies;
		ignore = ignoreArray ? new Set(ignoreArray) : new Set();
		fluidBuildTasksTscIgnoreDependenciesCache.set(rootDir, ignore);
	}
	return ignore;
};

const fluidBuildTasksTscIgnoreDevDependenciesCache = new Map<string, Set<string>>();
const getFluidBuildTasksIgnoreDevDependencies = (root: string) => {
	const rootDir = path.resolve(root);
	let ignore = fluidBuildTasksTscIgnoreDevDependenciesCache.get(rootDir);
	if (ignore === undefined) {
		const ignoreArray =
			getFluidBuildConfig(rootDir)?.policy?.fluidBuildTasks?.tsc?.ignoreDevDependencies;
		ignore = ignoreArray ? new Set(ignoreArray) : new Set();
		fluidBuildTasksTscIgnoreDevDependenciesCache.set(rootDir, ignore);
	}
	return ignore;
};
/**
 * Cache the FluidRepo object, so we don't have to load it repeatedly
 */
const repoCache = new Map<string, { repo: FluidRepo; packageMap: Map<string, Package> }>();
function getFluidPackageMap(root: string) {
	const rootDir = path.resolve(root);
	let record = repoCache.get(rootDir);
	if (record === undefined) {
		const repo = new FluidRepo(rootDir);
		const packageMap = repo.createPackageMap();
		record = { repo, packageMap };
		repoCache.set(rootDir, record);
	}
	return record.packageMap;
}

/**
 * Find script name for command in a npm package.json
 *
 * @param json - the package.json content to search script in
 * @param command - the command to find the script name for
 * @returns  first script name found to match the command
 */
function findScript(json: PackageJson, command: string) {
	for (const script in json.scripts) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (command === json.scripts[script]!) {
			return script;
		}
	}
	return undefined;
}

/**
 * By default, all `tsc*` script task will depend on "build:genver", and "^tsc",
 * So all the files that it depends on are in place.
 *
 * For dependent package typing (*.d.ts), it default to depend on tsc tasks (^tsc).
 * But not all dependent packages uses a "tsc" script task to generate the type.  This function
 * will go thru all the dependent packages within the mono repo and get the expected set of
 * task dependencies
 *
 * @param root - location of the Fluid Repo root
 * @param json - packages build dependencies to get.
 * @returns an array of build task dependencies name expected
 */
function getDefaultTscTaskDependencies(root: string, json: PackageJson) {
	const packageMap = getFluidPackageMap(root);
	const pkg = packageMap.get(json.name);
	if (pkg === undefined) {
		throw new Error(`Unable to find package ${json.name}`);
	}

	const checkPackageScripts = ["build:genver"];
	const ret = checkPackageScripts.filter((script) => json.scripts?.[script] !== undefined);
	const ignoreDeps = getFluidBuildTasksIgnoreDependencies(root);
	const ignoreDevDeps = getFluidBuildTasksIgnoreDevDependencies(root);
	let hasHeadTsc = false;
	for (const { name, version, dev } of pkg.combinedDependencies) {
		if ((dev ? ignoreDevDeps : ignoreDeps).has(name)) {
			continue;
		}
		const depPackage = packageMap.get(name);
		if (depPackage === undefined) {
			continue;
		}
		const satisfied =
			version!.startsWith("workspace:") || semver.satisfies(depPackage.version, version!);
		if (!satisfied) {
			continue;
		}
		// TODO: We assume the default build command that produce typing is "tsc"
		const script = findScript(depPackage.packageJson, "tsc");
		if (script === undefined) {
			continue;
		}
		if (script !== "tsc") {
			ret.push(`${depPackage.name}#${script}`);
		} else if (!hasHeadTsc) {
			ret.push("^tsc");
			hasHeadTsc = true;
		}
	}
	return ret;
}

function findTscScript(json: PackageJson, project: string) {
	if (project === "./tsconfig.json") {
		return findScript(json, "tsc");
	}
	return findScript(json, `tsc --project ${project}`);
}
/**
 * Get a list of build script names that the eslint depends on, based on .eslintrc file.
 * @param packageDir - directory of the package
 * @param root - directory of the Fluid repo root
 * @param json - content of the package.json
 * @returns
 */
function eslintGetScriptDependencies(
	packageDir: string,
	root: string,
	json: PackageJson,
): string[] {
	if (json.scripts?.["eslint"] === undefined) {
		return [];
	}

	const eslintConfig = getEsLintConfigFilePath(packageDir);
	if (!eslintConfig) {
		throw new Error(`Unable to find eslint config file for package in ${packageDir}`);
	}

	let config;
	try {
		const ext = path.parse(eslintConfig).ext;
		if (ext !== ".js" && ext !== ".cjs") {
			// TODO: optimize double read for TscDependentTask.getDoneFileContent and there.
			const configFile = fs.readFileSync(eslintConfig, "utf8");
			config = JSON5.parse(configFile);
		} else {
			config = require(path.resolve(eslintConfig));
			if (config === undefined) {
				throw new Error(`Exports not found in ${eslintConfig}`);
			}
		}
	} catch (e: any) {
		throw new Error(`Unable to load eslint config file ${eslintConfig}. ${e}`);
	}

	let projects = config.parserOptions?.project;
	if (projects === undefined) {
		// If we don't have projects, our task needs to have dependent build scripts
		return getDefaultTscTaskDependencies(root, json);
	}

	projects = Array.isArray(projects) ? projects : [projects];
	return projects.map((project) => {
		const found = findTscScript(json, project);

		// The main compile script is build:esnext, point eslint to it
		if (found === undefined) {
			throw new Error(
				`Unable to find script for project ${project} specified in ${eslintConfig}`,
			);
		}

		return found;
	});
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
function isFluidBuildEnabled(root: string, json: PackageJson) {
	return getFluidPackageMap(root).get(json.name) !== undefined;
}

/**
 * Check if a task has a specific dependency
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @param taskName - name of the task to check
 * @param searchDep - the dependent to find.
 * @returns true if searchDep is found for task, false otherwise
 */
function hasTaskDependency(root: string, json: PackageJson, taskName: string, searchDep: string) {
	const rootConfig = getFluidBuildConfig(root);
	const taskDefinitions = getTaskDefinitions(json, rootConfig?.tasks);
	const seenDep = new Set<string>();
	const pending: string[] = [];
	if (taskDefinitions[taskName]) {
		pending.push(...taskDefinitions[taskName].dependsOn);
	}

	while (pending.length !== 0) {
		const dep = pending.pop()!;
		if (seenDep.has(dep)) {
			// This could be repeats or circular dependency (which we are not trying to detect)
			continue;
		}
		seenDep.add(dep);
		if (dep === searchDep) {
			return true;
		}
		if (dep.startsWith("^") || dep.includes("#")) {
			continue;
		}
		if (taskDefinitions[dep]) {
			pending.push(...taskDefinitions[dep].dependsOn);
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
function checkTaskDeps(root: string, json: PackageJson, taskName: string, taskDeps: string[]) {
	const missingTaskDependencies = taskDeps.filter(
		(taskDep) => !hasTaskDependency(root, json, taskName, taskDep),
	);

	return missingTaskDependencies.length > 0
		? `'${taskName}' task is missing the following dependency: \n\t${missingTaskDependencies.join(
				"\n\t",
		  )}`
		: undefined;
}

/**
 * Fix up the actual dependencies of a task against an expected set of dependent tasks
 * @param root - directory of the Fluid repo root
 * @param json - package.json content for the package
 * @param taskName - task name to check the actual dependent tasks for
 * @param taskDeps - array of expected dependent tasks
 * @returns json object is modified to include the expected task dependencies
 */
function patchTaskDeps(root: string, json: PackageJson, taskName: string, taskDeps: string[]) {
	const missingTaskDependencies = taskDeps.filter(
		(taskDep) => !hasTaskDependency(root, json, taskName, taskDep),
	);

	if (missingTaskDependencies.length > 0) {
		const fileDep = json.fluidBuild?.tasks?.[taskName];
		if (fileDep === undefined) {
			if (json.fluidBuild === undefined) {
				(json as any).fluidBuild = {};
			}
			if (json.fluidBuild!.tasks === undefined) {
				json.fluidBuild!.tasks = {};
			}
			json.fluidBuild!.tasks[taskName] = taskDeps;
		} else {
			let depArray: string[];
			if (Array.isArray(fileDep)) {
				depArray = fileDep;
			} else if (fileDep.dependsOn !== undefined) {
				depArray = fileDep.dependsOn;
			} else {
				depArray = [];
				fileDep.dependsOn = depArray;
			}
			for (const missingDep of missingTaskDependencies) {
				if (!depArray.includes(missingDep)) {
					depArray.push(missingDep);
				}
			}
		}
	}
}

function getTscCommandDependencies(
	packageDir: string,
	json: PackageJson,
	script: string,
	command: string,
	defaultDeps: string[],
) {
	// If the project has a referenced project, depend on that instead of the default
	const parsedCommand = TscUtils.parseCommandLine(command);
	if (!parsedCommand) {
		throw new Error(`Error parsing tsc command for script '${script}': ${command}`);
	}
	const configFile = TscUtils.findConfigFile(packageDir, parsedCommand);
	const configJson = TscUtils.readConfigFile(configFile);
	if (configJson === undefined) {
		throw new Error(`Failed to load config file '${configFile}'`);
	}

	const deps: string[] = [];
	if (
		json.scripts["build:test"] === undefined &&
		json.scripts["typetests:gen"] !== undefined &&
		command === "tsc"
	) {
		deps.push("typetests:gen");
	}
	if (configJson.references) {
		const configFilePath = path.dirname(configFile);

		for (const ref of configJson.references) {
			let refConfigPath = path.join(configFilePath, ref.path);
			const fileInfo = fs.statSync(configFilePath);
			if (fileInfo.isDirectory()) {
				refConfigPath = path.join(refConfigPath, "tsconfig.json");
			}
			refConfigPath = `./${path.relative(packageDir, refConfigPath)}`;

			const referencedScript = findTscScript(json, refConfigPath);
			if (referencedScript === undefined) {
				throw new Error(
					`Unable to find tsc script for referenced project ${refConfigPath}`,
				);
			}
			deps.push(referencedScript);
		}
	}

	return deps.concat(defaultDeps);
}

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
	{
		name: "fluid-build-tasks-eslint",
		match,
		handler: (file, root) => {
			let json;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			if (!isFluidBuildEnabled(root, json)) {
				return;
			}
			let scriptDeps: string[];
			try {
				scriptDeps = eslintGetScriptDependencies(path.dirname(file), root, json);
				return checkTaskDeps(root, json, "eslint", scriptDeps);
			} catch (e: any) {
				return e.message;
			}
		},
		resolver: (file, root) => {
			let result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				if (!isFluidBuildEnabled(root, json)) {
					return;
				}
				let scriptDeps: string[];
				try {
					scriptDeps = eslintGetScriptDependencies(path.dirname(file), root, json);
					patchTaskDeps(root, json, "eslint", scriptDeps);
				} catch (e: any) {
					result = { resolved: false, message: e.message };
					return;
				}
			});
			return result;
		},
	},
	{
		name: "fluid-build-tasks-tsc",
		match,
		handler: (file, root) => {
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(file));
			} catch (err) {
				return "Error parsing JSON file: " + file;
			}

			if (!isFluidBuildEnabled(root, json)) {
				return;
			}
			if (json.scripts === undefined) {
				return;
			}
			const packageDir = path.dirname(file);
			const errors: string[] = [];
			const deps = getDefaultTscTaskDependencies(root, json);
			const ignore = getFluidBuildTasksTscIgnore(root);
			for (const script in json.scripts) {
				const command = json.scripts[script]!;
				if (command.startsWith("tsc") && !ignore.has(script)) {
					try {
						const checkDeps = getTscCommandDependencies(
							packageDir,
							json,
							script,
							command,
							deps,
						);
						// Check the dependencies
						const error = checkTaskDeps(root, json, script, checkDeps);
						if (error) {
							errors.push(error);
						}
					} catch (e: any) {
						return e.message;
					}
				}
			}
			return errors.length > 0 ? errors.join("\n") : undefined;
		},
		resolver: (file, root) => {
			let result: { resolved: boolean; message?: string } = { resolved: true };
			updatePackageJsonFile(path.dirname(file), (json) => {
				if (!isFluidBuildEnabled(root, json)) {
					return;
				}

				const packageDir = path.dirname(file);
				const deps = getDefaultTscTaskDependencies(root, json);
				const ignore = getFluidBuildTasksTscIgnore(root);
				for (const script in json.scripts) {
					const command = json.scripts[script]!;
					if (command.startsWith("tsc") && !ignore.has(script)) {
						try {
							const checkDeps = getTscCommandDependencies(
								packageDir,
								json,
								script,
								command,
								deps,
							);
							patchTaskDeps(root, json, script, checkDeps);
						} catch (e: any) {
							result = { resolved: false, message: e.message };
							return;
						}
					}
				}
			});
			return result;
		},
	},
];
