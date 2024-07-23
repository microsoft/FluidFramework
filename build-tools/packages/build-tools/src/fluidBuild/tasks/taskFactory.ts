/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getExecutableFromCommand } from "../../common/utils";
import type { BuildContext } from "../buildContext";
import { BuildPackage } from "../buildGraph";
import { isConcurrentlyCommand, parseConcurrentlyCommand } from "../parseCommands";
import { GroupTask } from "./groupTask";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { BiomeTask } from "./leaf/biomeTasks";
import { createDeclarativeTaskHandler } from "./leaf/declarativeTask";
import { DepcheckTask } from "./leaf/depcheckTasks";
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
import { type TaskHandler, isConstructorFunction } from "./taskHandlers";

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
	"depcheck": DepcheckTask,

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
 * Given a command executable, attempts to find a matching `TaskHandler` that will handle the task. If one is found, it
 * is returned; otherwise, it returns `UnknownLeafTask` as the default handler.
 *
 * Any DeclarativeTasks that are defined in the fluid-build config are checked first, followed by the built-in
 * executableToLeafTask constant.
 *
 * @param executable The command executable to find a matching task handler for.
 * @returns A `TaskHandler` for the task, if found. Otherwise `UnknownLeafTask` as the default handler.
 */
function getTaskForExecutable(executable: string, context: BuildContext): TaskHandler {
	const config = context.fluidBuildConfig;
	const declarativeTasks = config?.declarativeTasks;
	const taskMatch = declarativeTasks?.[executable];

	if (taskMatch !== undefined) {
		return createDeclarativeTaskHandler(taskMatch);
	}

	// No declarative task found matching the executable, so look it up in the built-in list.
	const builtInHandler: TaskHandler | undefined = executableToLeafTask[executable];

	// If no handler is found, return the UnknownLeafTask as the default handler. The task won't support incremental
	// builds.
	return builtInHandler ?? UnknownLeafTask;
}

export class TaskFactory {
	public static Create(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		pendingInitDep: Task[],
		taskName?: string,
	): GroupTask | LeafTask {
		// Split the "&&" first
		const subTasks = new Array<Task>();
		const steps = command.split("&&");
		if (steps.length > 1) {
			for (const step of steps) {
				subTasks.push(TaskFactory.Create(node, step.trim(), context, pendingInitDep));
			}
			// create a sequential group task
			return new GroupTask(node, command, context, subTasks, taskName, true);
		}

		// Parse concurrently
		if (isConcurrentlyCommand(command)) {
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
			return new GroupTask(node, command, context, [subTask], taskName);
		}

		// Leaf tasks; map the executable to a known task type. If none is found, the UnknownLeafTask is used.
		const executable = getExecutableFromCommand(
			command,
			context.fluidBuildConfig?.multiCommandExecutables ?? [],
		).toLowerCase();

		// Will return a task-specific handler or the UnknownLeafTask
		const handler = getTaskForExecutable(executable, context);

		// Invoke the function or constructor to create the task handler
		if (isConstructorFunction(handler)) {
			return new handler(node, command, context, taskName);
		} else {
			return handler(node, command, context, taskName);
		}
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
