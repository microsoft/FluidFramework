/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PackageJson } from "../common/npmPackage";
import { isConcurrentlyCommand, parseConcurrentlyCommand } from "./parseCommands";

/**
 * Task definitions (type `TaskDefinitions`) is an object describing build tasks for fluid-build.
 * Task names are represented as property name on the object and the value the task configuration
 * (type `TaskConfig`). Task configuration can a plain array of string, presenting the task's
 * dependencies or a full description (type `TaskConfigFull`).
 */
export interface TaskDefinitions {
	readonly [name: string]: TaskConfig;
}

/**
 * Task Name is a simple string that is normally a script name in the package.json.
 */
type TaskName = string;

type AnyTaskName = "*";

type PackageName = string;

/**
 * Task Dependencies Expansion:
 * When specify task dependencies, the following syntax is supported:
 * - "<name>": another task within the package
 * - "^<name>": all the task with the name in dependent packages.
 * - "*": any other task within the package (for 'before' and 'after' only, not allowed in 'dependsOn')
 * - "^*": all the task in the dependent packages (for 'after' only, not allowed in 'dependsOn' or 'before')
 *
 * When task definition is augmented in the package.json itself, the dependencies can also be:
 * - "<package>#<name>": specific dependent package's task
 * - "...": expand to the dependencies in global fluidBuild config (default is override)
 */
type TaskDependency =
	| TaskName
	| AnyTaskName
	| `^${TaskName | AnyTaskName}`
	| `${PackageName}#${TaskName | AnyTaskName}`
	| "...";

export type TaskDependencies = readonly TaskDependency[];

export interface TaskConfig {
	/**
	 * Task dependencies as a plain string array. Matched task will be scheduled to run before the current task.
	 * The strings specify dependencies for the task. See Task Dependencies Expansion above for details.
	 */
	readonly dependsOn: TaskDependencies;

	/**
	 * Tasks that needs to run before the current task (example clean). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", "before" is a weak dependency. It will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Notes 'before' is disallowed for non-script tasks since it has no effect on non-script tasks as they has no
	 * action to perform.
	 */
	readonly before: TaskDependencies;

	/**
	 * Tasks that this task includes. The included tasks will be scheduled to
	 * run while the current task. Thus any tasks that depend on this will
	 * satisfy a requirement of dependency on the included tasks.
	 *
	 * This should not be custom specified but derived from definition.
	 */
	readonly includes: readonly TaskName[];

	/**
	 * Tasks that needs to run after the current task (example copy tasks). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", "after" is a weak dependency. It will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Notes 'after' is disallowed for non-script tasks since it has no effect on non-script tasks as they has no
	 * action to perform.
	 */
	readonly after: TaskDependencies;

	/**
	 * Specify whether this is a script task or not. Default to true when this is omitted
	 * in the config file, or the task's config is just a plain string array.
	 *
	 * If true, the task will match with the script it the package.json and invoke
	 * the command once all the task's dependencies are satisfied.
	 *
	 * If false, the task will only trigger the dependencies (and not look for the script in package.json).
	 * It can be used as an alias to a group of tasks.
	 */
	readonly script: boolean;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

type MutableTaskConfig = Mutable<TaskConfig>;
interface MutableTaskDefinitions {
	[name: TaskName]: MutableTaskConfig;
}

// On file versions that allow fields to be omitted
export type TaskConfigOnDisk = TaskDependencies | Omit<Partial<TaskConfig>, "includes">;
export interface TaskDefinitionsOnDisk {
	readonly [name: TaskName]: TaskConfigOnDisk;
}

export interface WriteableTaskDefinitionsOnDisk {
	[name: TaskName]: Mutable<TaskConfigOnDisk>;
}

export const isTaskDependencies = (value: TaskConfigOnDisk): value is TaskDependencies => {
	return Array.isArray(value);
};

const makeClonedOrEmptyArray = <T>(value: readonly T[] | undefined): T[] =>
	value ? [...value] : [];

/**
 * Convert and fill out default values from TaskConfigOnDisk to TaskConfig in memory
 * @param config TaskConfig info loaded from a file
 * @returns TaskConfig filled out with default values
 */
function getFullTaskConfig(config: TaskConfigOnDisk): MutableTaskConfig {
	if (isTaskDependencies(config)) {
		return { dependsOn: [...config], script: true, includes: [], before: [], after: [] };
	} else {
		return {
			dependsOn: makeClonedOrEmptyArray(config.dependsOn),
			script: config.script ?? true,
			before: makeClonedOrEmptyArray(config.before),
			includes: [],
			after: makeClonedOrEmptyArray(config.after),
		};
	}
}

// Known task names
export const defaultBuildTaskName = "build";
export const defaultCleanTaskName = "clean";

// Default task definitions (for non root tasks).  User task config will override these.
//
// clean:
// - For "clean", just assume that it needs to before all other tasks
//
// All other tasks:
// - Follow the topological order of the package and wait until all the task for the other
//   packages first (i.e. after: ["^*"]).
// - These default dependencies for "before" and "after" propagate differently in a group task, where only
//   subtasks that has no name inherit the dependency. (where as normally, all subtask does)
//	 (i.e. isDefault: true)

export type TaskDefinition = TaskConfig & { readonly isDefault?: boolean };

/**
 * Get the default task definition for the given task name
 * @param taskName task name
 * @returns default task definition
 */
export function getDefaultTaskDefinition(taskName: string): TaskDefinition {
	return taskName === defaultCleanTaskName
		? defaultCleanTaskDefinition
		: defaultTaskDefinition;
}

const defaultTaskDefinition = {
	dependsOn: [],
	script: true,
	before: [],
	includes: [],
	after: ["^*"], // TODO: include "*" so the user configured task will run first, but we need to make sure it doesn't cause circular dependency first
	isDefault: true, // only propagate to unnamed sub tasks if it is a group task
} as const satisfies TaskDefinition;
const defaultCleanTaskDefinition = {
	dependsOn: [],
	script: true,
	before: ["*"], // clean are ran before all the tasks, add a week dependency.
	includes: [],
	after: [],
} as const satisfies TaskDefinition;

const detectInvalid = (
	config: readonly string[],
	isInvalid: (value: string) => boolean,
	name: string,
	kind: string,
	isGlobal: boolean,
) => {
	const invalid = config.filter((value) => isInvalid(value));
	if (invalid.length !== 0) {
		throw new Error(
			`Invalid '${kind}' dependencies '${invalid.join()}' for${
				isGlobal ? " global" : ""
			} task definition ${name}`,
		);
	}
};

export function normalizeGlobalTaskDefinitions(
	globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk | undefined,
): TaskDefinitions {
	// Normalize all on disk config to full config and validate
	const taskDefinitions: MutableTaskDefinitions = {};
	if (globalTaskDefinitionsOnDisk) {
		for (const name in globalTaskDefinitionsOnDisk) {
			const full = getFullTaskConfig(globalTaskDefinitionsOnDisk[name]);
			if (!full.script) {
				if (full.before.length !== 0 || full.after.length !== 0) {
					throw new Error(
						`Non-script global task definition '${name}' cannot have 'before' or 'after'`,
					);
				}
			}
			detectInvalid(
				full.dependsOn,
				(value) => value === "..." || value.includes("#") || value === "*" || value === "^*",
				name,
				"dependsOn",
				true,
			);
			detectInvalid(
				full.before,
				(value) => value === "..." || value.includes("#") || value === "^*",
				name,
				"before",
				true,
			);
			detectInvalid(
				full.after,
				(value) => value === "..." || value.includes("#"),
				name,
				"after",
				true,
			);
			taskDefinitions[name] = full;
		}
	}
	return taskDefinitions;
}

function expandDotDotDot(config: readonly string[], inherited: readonly string[]) {
	const expanded = config.filter((value) => value !== "...");
	if (inherited !== undefined && expanded.length !== config.length) {
		return expanded.concat(inherited);
	}
	return expanded;
}

/**
 * Extracts the all of the directly called scripts from a command line.
 * @param script - command line to parse
 * @param allScriptNames - all the script names in the package.json
 * @returns elements of script that are other scripts
 */
function getDirectlyCalledScripts(script: string, allScriptNames: string[]): string[] {
	const directlyCalledScripts: string[] = [];
	const commands = script.split("&&");
	for (const step of commands) {
		const commandLine = step.trim();
		if (isConcurrentlyCommand(commandLine)) {
			parseConcurrentlyCommand(
				commandLine,
				allScriptNames,
				(scriptName) => {
					directlyCalledScripts.push(scriptName);
				},
				() => {},
			);
		} else if (commandLine.startsWith("npm run ")) {
			const scriptName = commandLine.substring("npm run ".length);
			if (scriptName.includes(" ")) {
				// If the "script name" has a space, it is a "direct" call, but probably
				// has additional arguments that change exact execution of the script
				// and therefore is excluded as a "direct" call.
			} else if (allScriptNames.includes(scriptName)) {
				directlyCalledScripts.push(scriptName);
			} else {
				// This may not be relevant to the calling context, but there aren't
				// any known reasons why this should be preserved; so raise as an error.
				throw new Error(
					`Script '${scriptName}' not found processing command line: '${script}'`,
				);
			}
		}
	}
	return directlyCalledScripts;
}

/**
 * Combine and fill in default values for task definitions for a package.
 * @param json package.json content for the package
 * @param root root for the Fluid repo
 * @returns full task definitions for the package.
 */
export function getTaskDefinitions(
	json: PackageJson,
	globalTaskDefinitions: TaskDefinitions,
	isReleaseGroupRoot: boolean,
): TaskDefinitions {
	const packageScripts = json.scripts ?? {};
	const packageTaskDefinitions = json.fluidBuild?.tasks;
	const taskDefinitions: MutableTaskDefinitions = {};

	const globalAllow = (value) =>
		value.startsWith("^") ||
		(globalTaskDefinitions[value] !== undefined && !globalTaskDefinitions[value].script) ||
		packageScripts[value] !== undefined;
	const globalAllowExpansionsStar = (value) => value === "*" || globalAllow(value);

	// Initialize from global TaskDefinition, and filter out script tasks if the package doesn't have the script
	for (const name in globalTaskDefinitions) {
		const globalTaskDefinition = globalTaskDefinitions[name];
		if (globalTaskDefinition.script && packageScripts[name] === undefined) {
			// Skip script tasks if the package doesn't have the script
			continue;
		}
		// Only keep task or script references that exists
		// and make array clones in the process.
		taskDefinitions[name] = {
			dependsOn: globalTaskDefinition.dependsOn.filter(globalAllow),
			script: globalTaskDefinition.script,
			before: globalTaskDefinition.before.filter(globalAllowExpansionsStar),
			// `includes` are not inherited from the global task definitions (which should always be empty anyway)
			includes: [],
			after: globalTaskDefinition.after.filter(globalAllowExpansionsStar),
		};
	}

	// Override from the package.json, and resolve "..." to the global dependencies if any
	if (packageTaskDefinitions) {
		for (const name in packageTaskDefinitions) {
			const packageTaskDefinition = packageTaskDefinitions[name];
			const full = getFullTaskConfig(packageTaskDefinition);
			if (full.script) {
				const script = packageScripts[name];
				if (script === undefined) {
					throw new Error(`Script not found for task definition '${name}'`);
				} else if (script.startsWith("fluid-build ")) {
					throw new Error(`Script task should not invoke 'fluid-build' in '${name}'`);
				}
			} else {
				if (full.before.length !== 0 || full.after.length !== 0) {
					throw new Error(
						`Non-script task definition '${name}' cannot have 'before' or 'after'`,
					);
				}
			}

			const currentTaskConfig = taskDefinitions[name];
			full.dependsOn = expandDotDotDot(full.dependsOn, currentTaskConfig?.dependsOn);
			full.before = expandDotDotDot(full.before, currentTaskConfig?.before);
			full.after = expandDotDotDot(full.after, currentTaskConfig?.after);
			taskDefinitions[name] = full;
		}
	}

	// Check to make sure all the dependencies either is a target or script.
	// For release group root, the default for any task is to run all the tasks in the group
	// even if there is not task definition or script for it.
	if (!isReleaseGroupRoot) {
		const invalidDependOn = (value) =>
			!value.includes("#") &&
			!value.startsWith("^") &&
			taskDefinitions[value] === undefined &&
			json.scripts?.[value] === undefined;
		const invalidBefore = (value) => value !== "*" && invalidDependOn(value);
		const invalidAfter = (value) => value !== "^*" && invalidBefore(value);
		for (const name in taskDefinitions) {
			const taskDefinition = taskDefinitions[name];
			// Find any non-existent tasks or scripts in the dependencies
			detectInvalid(taskDefinition.dependsOn, invalidDependOn, name, "dependsOn", false);
			detectInvalid(taskDefinition.before, invalidBefore, name, "before", false);
			detectInvalid(taskDefinition.after, invalidAfter, name, "after", false);
		}
	}

	// Add `includes` task definitions for the package.json scripts
	const allScriptNames = Object.keys(packageScripts);
	for (const [name, script] of Object.entries(packageScripts)) {
		const directlyCalledScripts = getDirectlyCalledScripts(
			// `undefined` is not a possible JSON result.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			script!,
			allScriptNames,
		);
		if (directlyCalledScripts.length > 0) {
			// Add a task definition for the script if there isn't one already.
			const taskDefinition = taskDefinitions[name];
			if (taskDefinition === undefined) {
				taskDefinitions[name] = {
					dependsOn: [],
					before: [],
					includes: directlyCalledScripts,
					after: [],
					script: true,
				};
			} else {
				// Confirm `includes` is not specified in the manual task specifications
				if (taskDefinition.includes.length > 0) {
					throw new Error(
						`'includes' is not expected in manual task definition for '${name}'`,
					);
				}
				taskDefinition.includes = directlyCalledScripts;
			}
		}
	}

	return taskDefinitions;
}
