/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { getExecutableFromCommand } from "../../common/utils";
import { BuildPackage } from "../buildGraph";
import { ConcurrentNPMTask } from "./concurrentNpmTask";
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
import { NPMTask } from "./npmTask";
import { Task } from "./task";

// Map of executable name to LeafTasks
const executableToLeafTask: {
	[key: string]: new (node: BuildPackage, command: string, target?: string) => LeafTask;
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
		target?: string,
	) {
		// Split the "&&" first
		const subTasks = new Array<Task>();
		const steps = command.split("&&");
		if (steps.length > 1) {
			for (const step of steps) {
				subTasks.push(TaskFactory.Create(node, step.trim(), pendingInitDep));
			}
			return new NPMTask(node, command, subTasks, target);
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
			return new ConcurrentNPMTask(node, command, subTasks, target);
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
			return new NPMTask(node, command, [subTask], target);
		}

		// Leaf task
		const executable = getExecutableFromCommand(command).toLowerCase();
		const ctor = executableToLeafTask[executable];
		if (ctor) {
			return new ctor(node, command, target);
		}
		return new UnknownLeafTask(node, command, target);
	}

	public static CreateConcurrentGroupTask(
		node: BuildPackage,
		command: string,
		subTasks: Task[],
		target: string | undefined,
	) {
		return new ConcurrentNPMTask(node, command, subTasks, target);
	}
}
