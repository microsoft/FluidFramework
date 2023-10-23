/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PackageJson } from "./npmPackage";

/**
 * Task definitions (type `TaskDefinitions`) is an object describing build tasks for fluid-build.
 * Task names are represented as property name on the object and the value the task configuration
 * (type `TaskConfig`). Task configuration can a plain array of string, presenting the task's
 * dependencies or a full description (type `TaskConfigFull`).
 *
 * Task Dependencies Expansion:
 * When specify task dependencies, the following syntax is supported:
 * - "<name>": another task within the package
 * - "^<name>": all the task with the name in dependent packages.
 * - "*": any other task within the package (for 'before' and 'after' only, not allowed for 'dependsOn')
 *
 * When task definition is augmented in the package.json itself, the dependencies can also be:
 * - "<package>#<name>": specific dependent package's task
 * - "...": expand to the dependencies in global fluidBuild config (default is override)
 */

export type TaskDependencies = string[];
export interface TaskConfig {
	/**
	 * Task dependencies as a plain string array. Matched task will be scheduled to run before the current task.
	 * The strings specify dependencies for the task. See Task Dependencies Expansion above for details.
	 */
	dependsOn: TaskDependencies;

	/**
	 * Tasks that needs to run before the current task (example clean). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", that this will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Notes 'before' is disallowed for non-script tasks since it has no effect on non-script tasks because they has no
	 * action to perform.
	 */
	before: TaskDependencies;
	/**
	 * Tasks that needs to run after the current task (example copy tasks). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", that this will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Notes 'after' is disallowed for non-script tasks since it has no effect on non-script tasks because they has no
	 * action to perform.
	 */
	after: TaskDependencies;

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
	script: boolean;
}

export interface TaskDefinitions {
	[name: string]: TaskConfig;
}

// On file versions that allow fields to be omitted
export type TaskConfigOnDisk = TaskDependencies | Partial<TaskConfig>;
export interface TaskDefinitionsOnDisk {
	[name: string]: TaskConfigOnDisk;
}

/**
 * Convert and fill out default values from TaskConfigOnDisk to TaskConfig in memory
 * @param config TaskConfig info loaded from a file
 * @returns TaskConfig filled out with default values
 */
function getFullTaskConfig(config: TaskConfigOnDisk): TaskConfig {
	if (Array.isArray(config)) {
		return { dependsOn: config, script: true, before: [], after: [] };
	} else {
		return {
			dependsOn: config.dependsOn ?? [],
			script: config.script ?? true,
			before: config.before ?? [],
			after: config.after ?? [],
		};
	}
}

const detectInvalid = (
	config: string[],
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
	const taskDefinitions: TaskDefinitions = {};
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
				(value) => value === "..." || value.includes("#") || value === "*",
				name,
				"dependsOn",
				true,
			);
			detectInvalid(
				full.before,
				(value) => value === "..." || value.includes("#"),
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
) {
	const packageTaskDefinitions = json.fluidBuild?.tasks;
	const taskDefinitions: TaskDefinitions = {};

	// Initialize from global TaskDefinition, and filter out script tasks if the package doesn't have the script
	for (const name in globalTaskDefinitions) {
		const globalTaskDefinition = globalTaskDefinitions[name];
		if (globalTaskDefinition.script && json.scripts?.[name] === undefined) {
			// Skip script tasks if the package doesn't have the script
			continue;
		}
		taskDefinitions[name] = { ...globalTaskDefinition };
	}
	const globalAllow = (value) =>
		value.startsWith("^") ||
		taskDefinitions[value] !== undefined ||
		json.scripts?.[value] !== undefined;
	const globalAllowExpansionsStar = (value) => value === "*" || globalAllow(value);
	// Only keep task or script references that exists
	for (const name in taskDefinitions) {
		const taskDefinition = taskDefinitions[name];
		taskDefinition.dependsOn = taskDefinition.dependsOn.filter(globalAllow);
		taskDefinition.before = taskDefinition.before.filter(globalAllowExpansionsStar);
		taskDefinition.after = taskDefinition.after.filter(globalAllowExpansionsStar);
	}

	const expandDotDotDot = (packageConfig, globalConfig) => {
		const expanded = packageConfig.filter((value) => value !== "...");
		if (globalConfig !== undefined && expanded.length !== packageConfig.length) {
			return expanded.concat(globalConfig);
		}
		return expanded;
	};

	// Override from the package.json, and resolve "..." to the global dependencies if any
	if (packageTaskDefinitions) {
		for (const name in packageTaskDefinitions) {
			const packageTaskDefinition = packageTaskDefinitions[name];
			const full = getFullTaskConfig(packageTaskDefinition);
			if (full.script) {
				const script = json.scripts?.[name];
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

	// Check to make sure all the dependencies either is an target or script
	// For release group root, the default for any task is to run all the tasks in the group
	// even if there is not task definition or script for it.
	if (!isReleaseGroupRoot) {
		const packageInvalid = (value) =>
			!value.includes("#") &&
			!value.startsWith("^") &&
			taskDefinitions[value] === undefined &&
			json.scripts?.[value] === undefined;
		const packageInvalidAllowStar = (value) => value !== "*" && packageInvalid(value);
		for (const name in taskDefinitions) {
			const taskDefinition = taskDefinitions[name];
			// Find any non-existent tasks or scripts in the dependencies
			detectInvalid(taskDefinition.dependsOn, packageInvalid, name, "dependsOn", false);
			detectInvalid(taskDefinition.before, packageInvalidAllowStar, name, "before", false);
			detectInvalid(taskDefinition.after, packageInvalidAllowStar, name, "after", false);
		}
	}
	return taskDefinitions;
}
