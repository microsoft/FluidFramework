/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getExecutableFromCommand } from "../../common/utils";
import { BuildPackage } from "../buildGraph";
import { GroupTask } from "./groupTask";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { BiomeTask } from "./leaf/biomeTasks";
import { FlubCheckLayerTask, FlubCheckPolicyTask, FlubListTask } from "./leaf/flubTasks";
import { GenerateEntrypointsTask } from "./leaf/generateEntrypointsTask.js";
import { LeafTask, UnknownLeafTask } from "./leaf/leafTask";
import { EsLintTask, TsLintTask } from "./leaf/lintTasks";
import {
	CopyfilesTask,
	DepCruiseTask,
	EchoTask,
	GenVerTask,
	GoodFence,
	LesscTask,
	TypeValidationTask,
} from "./leaf/miscTasks";
import { PrettierTask } from "./leaf/prettierTask";
import { RenameTypesTask } from "./leaf/renamerTask";
import { Ts2EsmTask } from "./leaf/ts2EsmTask";
import { TscMultiTask, TscTask } from "./leaf/tscTask";
import { WebpackTask } from "./leaf/webpackTask";
import { Task } from "./task";

// Map of executable name to LeafTasks
const executableToLeafTask: {
	[key: string]: new (node: BuildPackage, command: string, taskName?: string) => LeafTask;
} = {
	"ts2esm": Ts2EsmTask,
	"tsc": TscTask,
	"fluid-tsc": TscTask,
	"tsc-multi": TscMultiTask,
	"tslint": TsLintTask,
	"eslint": EsLintTask,
	"webpack": WebpackTask,
	"parallel-webpack": WebpackTask,
	"lessc": LesscTask,
	"copyfiles": CopyfilesTask,
	"echo": EchoTask,
	"prettier": PrettierTask,
	"gen-version": GenVerTask,
	"gf": GoodFence,
	"api-extractor": ApiExtractorTask,
	"flub list": FlubListTask,
	"flub check layers": FlubCheckLayerTask,
	"flub check policy": FlubCheckPolicyTask,
	"flub generate entrypoints": GenerateEntrypointsTask,
	"flub generate typetests": TypeValidationTask,
	"fluid-type-test-generator": TypeValidationTask,
	"depcruise": DepCruiseTask,
	"biome check": BiomeTask,
	"biome format": BiomeTask,

	// Note that this assumes that "renamer" is ONLY used for renaming types. If it is used in a different task in the
	// pipeline then this mapping will have to be updated.
	"renamer": RenameTypesTask,
	"flub rename-types": RenameTypesTask,
};

/**
 * Regular expression to parse `concurrently` arguments that specify package scripts.
 * The format is `npm:<script>` or `"npm:<script>*"`; in the latter case script
 * is a prefix that is used to match one or more package scripts.
 * Quotes are optional but expected to escape the `*` character.
 */
const regexNpmConcurrentlySpec =
	/^(?<quote>"?)npm:(?<script>[^*]+?)(?<wildcard>\*?)\k<quote>$/;

export class TaskFactory {
	public static Create(
		node: BuildPackage,
		command: string,
		pendingInitDep: Task[],
		taskName?: string,
	) {
		// Split the "&&" first
		const subTasks = new Array<Task>();
		const steps = command.split("&&");
		if (steps.length > 1) {
			for (const step of steps) {
				subTasks.push(TaskFactory.Create(node, step.trim(), pendingInitDep));
			}
			// create a sequential group task
			return new GroupTask(node, command, subTasks, taskName, true);
		}

		// Parse concurrently
		const concurrently = command.startsWith("concurrently ");
		if (concurrently) {
			const subTasks = new Array<Task>();
			const steps = command.substring("concurrently ".length).split(/ +/);
			for (const step of steps) {
				const npmMatch = regexNpmConcurrentlySpec.exec(step);
				if (npmMatch?.groups !== undefined) {
					const scriptSpec = npmMatch.groups.script;
					let scriptNames: string[];
					// When npm:... ends with *, it is a wildcard match of all scripts that start with the prefix.
					if (npmMatch.groups.wildcard === "*") {
						// Note: result of no matches is allowed, so long as another concurrently step has a match.
						// This avoids general tool being overly prescriptive about script patterns. If always
						// having a match is desired, then such a policy should be enforced.
						scriptNames = Object.keys(node.pkg.packageJson.scripts).filter((s) =>
							s.startsWith(scriptSpec),
						);
					} else {
						scriptNames = [scriptSpec];
					}
					for (const scriptName of scriptNames) {
						const task = node.getScriptTask(scriptName, pendingInitDep);
						if (task === undefined) {
							throw new Error(
								`${
									node.pkg.nameColored
								}: Unable to find script '${scriptName}' listed in 'concurrently' command${
									taskName ? ` '${taskName}'` : ""
								}`,
							);
						}
						subTasks.push(task);
					}
				} else {
					subTasks.push(TaskFactory.Create(node, step, pendingInitDep));
				}
			}
			if (subTasks.length === 0) {
				throw new Error(
					`${node.pkg.nameColored}: Unable to find any tasks listed in 'concurrently' command${
						taskName ? ` '${taskName}'` : ""
					}`,
				);
			}
			return new GroupTask(node, command, subTasks, taskName);
		}

		// Resolve "npm run" to the actual script
		if (command.startsWith("npm run ")) {
			const scriptName = command.substring("npm run ".length);
			const subTask = node.getScriptTask(scriptName, pendingInitDep);
			if (subTask === undefined) {
				throw new Error(
					`${node.pkg.nameColored}: Unable to find script '${scriptName}' in 'npm run' command`,
				);
			}
			// Even though there is only one task, create a group task for the taskName
			return new GroupTask(node, command, [subTask], taskName);
		}

		// Leaf task
		const executable = getExecutableFromCommand(command).toLowerCase();
		const ctor = executableToLeafTask[executable];
		if (ctor) {
			return new ctor(node, command, taskName);
		}
		return new UnknownLeafTask(node, command, taskName);
	}

	/**
	 * Create a target task that only have dependencies but no action.
	 * The dependencies will be initialized using the target name and the task definition for the package
	 * @param node build package for the target task
	 * @param taskName target name
	 * @returns the target task
	 */
	public static CreateTargetTask(node: BuildPackage, taskName: string | undefined) {
		return new GroupTask(node, `fluid-build -t ${taskName}`, [], taskName);
	}

	public static CreateTaskWithLifeCycle(
		node: BuildPackage,
		scriptTask: Task,
		preScriptTask?: Task,
		postScriptTask?: Task,
	) {
		if (preScriptTask === undefined && postScriptTask === undefined) {
			return scriptTask;
		}
		const subTasks: Task[] = [];
		if (preScriptTask !== undefined) {
			subTasks.push(preScriptTask);
		}
		subTasks.push(scriptTask);
		if (postScriptTask !== undefined) {
			subTasks.push(postScriptTask);
		}
		return new GroupTask(
			node,
			`npm run ${scriptTask.taskName}`,
			subTasks,
			scriptTask.taskName,
			true,
		);
	}
}
