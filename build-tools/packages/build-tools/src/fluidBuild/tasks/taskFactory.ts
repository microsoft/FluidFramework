/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getExecutableFromCommand } from "../../common/utils";
import type { BuildContext } from "../buildContext";
import { BuildPackage } from "../buildGraph";
import { TaskFileDependencies } from "../fluidTaskDefinitions";
import { isConcurrentlyCommand, parseConcurrentlyCommand } from "../parseCommands";
import { GroupTask } from "./groupTask";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { BiomeTask } from "./leaf/biomeTasks";
import { DeclarativeLeafTask } from "./leaf/declarativeTask";
import { FlubCheckLayerTask, FlubCheckPolicyTask, FlubListTask } from "./leaf/flubTasks";
import { GenerateEntrypointsTask } from "./leaf/generateEntrypointsTask.js";
import { type LeafTask, UnknownLeafTask } from "./leaf/leafTask";
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
import { Ts2EsmTask } from "./leaf/ts2EsmTask";
import { TscTask } from "./leaf/tscTask";
import { WebpackTask } from "./leaf/webpackTask";
import { type Task } from "./task";
import { type TaskHandler } from "./taskHandlers";

// Map of executable name to LeafTasks
const executableToLeafTask: {
	[key: string]: TaskHandler;
} = {
	"ts2esm": Ts2EsmTask,
	"tsc": TscTask,
	"fluid-tsc": TscTask,
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
	"flub check layers": FlubCheckLayerTask,
	"flub check policy": FlubCheckPolicyTask,
	"flub generate entrypoints": GenerateEntrypointsTask,
	"flub generate typetests": TypeValidationTask,
	"fluid-type-test-generator": TypeValidationTask,
	"depcruise": DepCruiseTask,
	"biome check": BiomeTask,
	"biome format": BiomeTask,

	// flub list does not require a -g flag - the third argument is the release group. Rather than add custom handling for
	// that, we just add mappings for all three.
	"flub list": FlubListTask,
	"flub list build-tools": FlubListTask,
	"flub list client": FlubListTask,
	"flub list server": FlubListTask,
	"flub list gitrest": FlubListTask,
	"flub list historian": FlubListTask,
} as const;

/**
 * Create a leaf task for the given command.
 * If the task has file dependencies specified, or the executable is a declarative task, create a declarative task.
 * Otherwise, find a known executable task handler for the executable, or use the UnknownLeafTask as a fallback.
 *
 * @param node - build package for the target task
 * @param command - the command to create the task for
 * @param context - the build context
 * @param taskName - target name
 * @param files - file dependencies for the task, if any
 * @returns A `TaskHandler` for the task, if found. Otherwise `UnknownLeafTask` as the default handler.
 */
function getLeafTaskForCommand(
	node: BuildPackage,
	command: string,
	context: BuildContext,
	taskName?: string,
	files?: TaskFileDependencies,
) {
	// If the task has file dependencies specification, create a declarative task
	if (files !== undefined) {
		return new DeclarativeLeafTask(node, command, context, taskName, files);
	}

	// If the executable has a declarative task defined, use that
	const executable = getExecutableFromCommand(
		command,
		context.fluidBuildConfig?.multiCommandExecutables ?? [],
	);
	const config = context.fluidBuildConfig;
	const declarativeTasks = config?.declarativeTasks;
	const taskMatch =
		node.pkg.packageJson.fluidBuild?.declarativeTasks?.[executable] ??
		declarativeTasks?.[executable];

	if (taskMatch !== undefined) {
		return new DeclarativeLeafTask(node, command, context, taskName, taskMatch);
	}

	// Create a task using task handler of a known executable, or use the UnknownLeafTask as a fallback
	const handler = executableToLeafTask[executable] ?? UnknownLeafTask;
	return new handler(node, command, context, taskName);
}

function getRunScriptName(command: string, packageManager: string): string | undefined {
	// Remove the package manager name from the command
	if (command.startsWith("npm run ")) {
		return command.substring("npm run ".length);
	}
	// Only support yarn and pnpm for now
	if (packageManager === "yarn" || packageManager === "pnpm") {
		const packageManagerRun = `${packageManager} run `;

		if (command.startsWith(packageManagerRun)) {
			return command.substring(packageManagerRun.length);
		}
	}
	return undefined;
}

export class TaskFactory {
	public static Create(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		pendingInitDep: Task[],
		taskName?: string,
		files?: TaskFileDependencies,
	): GroupTask | LeafTask {
		// Split the "&&" first
		const subTasks = new Array<Task>();
		const steps = command.split("&&");
		if (steps.length > 1) {
			for (const step of steps) {
				subTasks.push(TaskFactory.Create(node, step.trim(), context, pendingInitDep));
			}

			if (files !== undefined) {
				throw new Error(
					`File dependency specification not allowed on multi-command tasks: ${taskName}`,
				);
			}
			// create a sequential group task
			return new GroupTask(node, command, context, subTasks, taskName, true);
		}

		// Parse concurrently
		if (isConcurrentlyCommand(command)) {
			if (files !== undefined) {
				throw new Error(
					`File dependency specification not allowed on concurrently command tasks: ${taskName}`,
				);
			}
			const subTasks = new Array<Task>();
			// Note: result of no matches is allowed from concurrenly wildcard, so long as another
			// concurrently step has a match.
			// This avoids general tool being overly prescriptive about script patterns. If always
			// having a match is desired, then such a policy should be enforced.
			parseConcurrentlyCommand(
				command,
				Object.keys(node.pkg.packageJson.scripts),
				(scriptName) => {
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
				},
				(step) => {
					subTasks.push(TaskFactory.Create(node, step, context, pendingInitDep));
				},
			);
			if (subTasks.length === 0) {
				throw new Error(
					`${node.pkg.nameColored}: Unable to find any tasks listed in 'concurrently' command${
						taskName ? ` '${taskName}'` : ""
					}`,
				);
			}
			return new GroupTask(node, command, context, subTasks, taskName);
		}

		// Resolve "npm run" (or other package manager's run command) to the actual script if possible
		const runScript = getRunScriptName(command, node.pkg.packageManager);
		if (runScript !== undefined) {
			const subTask = node.getScriptTask(runScript, pendingInitDep);
			if (subTask !== undefined) {
				if (files !== undefined) {
					throw new Error(
						`File dependency specification not allowed on package manager run command tasks: ${taskName}`,
					);
				}
				// Even though there is only one task, create a group task for the taskName
				return new GroupTask(node, command, context, [subTask], taskName);
			}
			// Unable find the script.  Treat it as if it is a plain leaf task.
		}

		// Leaf tasks
		return getLeafTaskForCommand(node, command, context, taskName, files);
	}

	/**
	 * Create a target task that only have dependencies but no action.
	 * The dependencies will be initialized using the target name and the task definition for the package
	 * @param node build package for the target task
	 * @param taskName target name
	 * @returns the target task
	 */
	public static CreateTargetTask(
		node: BuildPackage,
		context: BuildContext,
		taskName: string | undefined,
	) {
		return new GroupTask(node, `fluid-build -t ${taskName}`, context, [], taskName);
	}

	public static CreateTaskWithLifeCycle(
		node: BuildPackage,
		context: BuildContext,
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
			context,
			subTasks,
			scriptTask.taskName,
			true,
		);
	}
}
