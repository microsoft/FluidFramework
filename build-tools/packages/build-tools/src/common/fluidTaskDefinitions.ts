/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getFluidBuildConfig } from "./fluidUtils";
import { PackageJson } from "./npmPackage";

/**
 * Task definitions (type `TaskDefinitions`) is an object describing build tasks for fluid-build.
 * Task names are represented as property name on the object and the value the task configuration
 * (type `TaskConfig`). Task configuration can a plain array of string, presenting the task's
 * dependencies or a full description (type `TaskConfigFull`).
 */

export type TaskDependencies = string[];
export interface TaskConfig {
	/**
	 * Task dependencies as a plain string array.
	 * The string can specify dependencies:
	 * - "<name>": another task within the package
	 * - "^<name>": all the task with the name in dependent packages.
	 *
	 * When task definition is augmented in the package.json itself the dependencies can be:
	 * - "<package>#<name>": specific dependent package's task
	 * - "...": expand to the dependencies in global fluidBuild config
	 */
	dependsOn: TaskDependencies;
	/**
	 * Specify whether this is a script task or not. Default to true when this is omitted
	 * in the config file, or the task's config is just a plain string array.
	 *
	 * If true, the task will match with the script it the package.json and invoke
	 * the command once all the dependencies are satisfied.
	 *
	 * If false, the task will only trigger the dependencies. It can be used to define
	 * group of task for the command line.
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
		return { dependsOn: config, script: true };
	} else {
		return {
			dependsOn: config.dependsOn ?? [],
			script: config.script ?? true,
		};
	}
}

/**
 * Combine and fill in default values for task definitions for a package.
 * @param json package.json content for the package
 * @param root root for the Fluid repo
 * @returns full task definitions for the package.
 */
export function getTaskDefinitions(
	json: PackageJson,
	globalTaskDefinitions?: TaskDefinitionsOnDisk,
) {
	const packageTaskDefinitions = json.fluidBuild?.tasks;
	const taskConfig: TaskDefinitions = {};

	// Initialize from global TaskDefinition, taking targets and scripts that exist in the package.json
	if (globalTaskDefinitions) {
		for (const name in globalTaskDefinitions) {
			const config = globalTaskDefinitions[name];
			const full = getFullTaskConfig(config);
			if (full.script && json.scripts?.[name] === undefined) {
				// Skip script global task definition if the package doesn't have the script
				continue;
			}
			const invalid = full.dependsOn.filter(
				(value) => value === "..." || value.includes("#"),
			);
			if (invalid.length !== 0) {
				throw new Error(
					`Invalid global dependencies '${invalid.join()}' for task definition ${name}`,
				);
			}
			taskConfig[name] = full;
		}
		// Only keep script that exists
		for (const name in taskConfig) {
			const config = taskConfig[name];
			config.dependsOn = config.dependsOn.filter(
				(value) =>
					value.startsWith("^") ||
					taskConfig[value] !== undefined ||
					json.scripts?.[value] !== undefined,
			);
		}
	}
	// Override from the package.json, and resolve "..." to the global dependencies if any
	if (packageTaskDefinitions) {
		for (const name in packageTaskDefinitions) {
			const config = packageTaskDefinitions[name];
			const full = getFullTaskConfig(config);
			if (full.script && json.scripts?.[name] === undefined) {
				throw new Error(`Script not found for task definition '${name}'`);
			}

			const dependsOn = full.dependsOn.filter((value) => value !== "...");
			if (taskConfig[name] !== undefined && dependsOn.length !== full.dependsOn.length) {
				full.dependsOn = dependsOn.concat(taskConfig[name].dependsOn);
			} else {
				full.dependsOn = dependsOn;
			}
			taskConfig[name] = full;
		}
	}

	// Check to make sure all the dependencies either is an target or script
	for (const name in taskConfig) {
		const config = taskConfig[name];
		// Find any non-existent scripts in the dependencies
		const invalid = config.dependsOn.filter(
			(value) =>
				!value.includes("#") &&
				!value.startsWith("^") &&
				taskConfig[value] === undefined &&
				json.scripts?.[value] === undefined,
		);
		if (invalid.length !== 0) {
			throw new Error(`Invalid dependencies '${invalid.join()}' for task definition ${name}`);
		}
	}
	return taskConfig;
}
