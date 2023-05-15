/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { getExecutableFromCommand } from "../../common/utils";
import { BuildPackage } from "../buildGraph";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { LeafTask, UnknownLeafTask } from "./leaf/leafTask";
import { EsLintTask, TsLintTask } from "./leaf/lintTasks";
import {
	CopyfilesTask,
	EchoTask,
	GenVerTask,
	GoodFence,
	LesscTask,
	TypeValidationTask,
} from "./leaf/miscTasks";
import { PrettierTask } from "./leaf/prettierTask";
import { TscTask } from "./leaf/tscTask";
import { WebpackTask } from "./leaf/webpackTask";
import { GroupTask } from "./groupTask";
import { Task } from "./task";

// Map of executable name to LeafTasks
const executableToLeafTask: {
	[key: string]: new (node: BuildPackage, command: string, taskName?: string) => LeafTask;
} = {
	"tsc": TscTask,
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
	"flub generate typetests": TypeValidationTask,
	"fluid-type-test-generator": TypeValidationTask,
};

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
			const steps = command.substring("concurrently ".length).split(" ");
			for (const step of steps) {
				const stepT = step.trim();
				if (stepT.startsWith("npm:")) {
					const scriptName = stepT.substring("npm:".length);
					const task = node.getScriptTask(scriptName, pendingInitDep);
					if (task === undefined) {
						throw new Error(
							`${node.pkg.nameColored}: Unable to find script '${scriptName}' in 'npm run' command`,
						);
					}
					subTasks.push(task);
				} else {
					subTasks.push(TaskFactory.Create(node, stepT, pendingInitDep));
				}
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
}
