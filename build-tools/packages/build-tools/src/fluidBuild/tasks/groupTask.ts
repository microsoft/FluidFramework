/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncPriorityQueue } from "async";

import type { BuildContext } from "../buildContext";
import { BuildPackage, BuildResult } from "../buildGraph";
import { LeafTask } from "./leaf/leafTask";
import { Task, TaskExec } from "./task";

export class GroupTask extends Task {
	constructor(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		protected readonly subTasks: Task[],
		taskName: string | undefined,
		private readonly sequential: boolean = false,
	) {
		super(node, command, context, taskName);
	}

	public initializeDependentLeafTasks() {
		// Push this task's dependencies to the leaves
		this.addDependentLeafTasks(this.transitiveDependentLeafTask);

		// Make sure each subtask depends on previous subtask to ensure sequential execution
		if (this.sequential) {
			let prevTask: Task | undefined;
			for (const task of this.subTasks) {
				if (prevTask !== undefined) {
					const leafTasks = new Set<LeafTask>();
					prevTask.collectLeafTasks(leafTasks);
					task.addDependentLeafTasks(leafTasks);
				}
				prevTask = task;
			}
		}
	}

	public addDependentTasks(dependentTasks: Task[], isDefault: boolean): void {
		if (isDefault) {
			// Propagate to unnamed subtasks only if it's a default dependency
			for (const task of this.subTasks) {
				if (task.taskName === undefined) {
					task.addDependentTasks(dependentTasks, isDefault);
				}
			}
		} else {
			super.addDependentTasks(dependentTasks, isDefault);
		}
	}

	public collectLeafTasks(leafTasks: Set<LeafTask>) {
		for (const task of this.subTasks) {
			task.collectLeafTasks(leafTasks);
		}
	}

	public addDependentLeafTasks(dependentLeafTasks: Iterable<LeafTask>): void {
		for (const task of this.subTasks) {
			task.addDependentLeafTasks(dependentLeafTasks);
		}
	}

	public initializeWeight() {
		for (const task of this.subTasks) {
			task.initializeWeight();
		}
	}

	protected async checkIsUpToDate(): Promise<boolean> {
		const taskUpToDateP = new Array<Promise<boolean>>();
		for (const task of this.subTasks) {
			taskUpToDateP.push(task.isUpToDate());
		}
		const taskUpToDateArr = await Promise.all(taskUpToDateP);
		for (const taskUpToDate of taskUpToDateArr) {
			if (!taskUpToDate) {
				return false;
			}
		}
		return true;
	}

	protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		this.traceExec(`Begin Group Task`);
		const taskP = new Array<Promise<BuildResult>>();
		for (const task of this.subTasks) {
			taskP.push(task.run(q));
		}
		const results = await Promise.all(taskP);
		this.traceExec(`End Group Task`);

		let retResult = BuildResult.UpToDate;
		for (const result of results) {
			if (result === BuildResult.Failed) {
				return BuildResult.Failed;
			}

			if (result === BuildResult.Success) {
				retResult = BuildResult.Success;
			}
		}
		return retResult;
	}
}
