/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncPriorityQueue } from "async";

import { BuildPackage, BuildResult } from "../buildGraph";
import { NPMTask } from "./npmTask";
import { Task, TaskExec } from "./task";

export class ConcurrentNPMTask extends NPMTask {
	constructor(node: BuildPackage, command: string, tasks: Task[], target: string | undefined) {
		super(node, command, tasks, target);
	}

	protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		this.logVerboseTask(`Begin Concurrent Child Tasks`);
		const taskP = new Array<Promise<BuildResult>>();
		for (const task of this.subTasks) {
			taskP.push(task.run(q));
		}
		const results = await Promise.all(taskP);
		let retResult = BuildResult.UpToDate;
		for (const result of results) {
			if (result === BuildResult.Failed) {
				return BuildResult.Failed;
			}

			if (result === BuildResult.Success) {
				retResult = BuildResult.Success;
			}
		}
		this.logVerboseTask(`End Concurrent Child Tasks`);
		return retResult;
	}
}
