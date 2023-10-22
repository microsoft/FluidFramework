/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import { AsyncPriorityQueue } from "async";

import { BuildPackage, BuildResult } from "../buildGraph";
import { LeafTask } from "./leaf/leafTask";
import { Task, TaskExec } from "./task";

export class GroupTask extends Task {
	private initializedDependentLeafTasks = false;

	constructor(
		node: BuildPackage,
		command: string,
		protected readonly subTasks: Task[],
		taskName: string | undefined,
		private readonly sequential: boolean = false,
	) {
		super(node, command, taskName);
		if (this.sequential) {
			// Make sure each subtask depends on previous subtask to ensure sequential execution
			let prevTask: Task | undefined;
			for (const task of this.subTasks) {
				if (prevTask !== undefined) {
					task.dependentTasks.push(prevTask);
				}
				prevTask = task;
			}
		}
	}

	public initializeDependentLeafTasks() {
		// initializeDependentLeafTask may get call multiple times because of inclusion
		// as subtasks in group tasks
		if (!this.initializedDependentLeafTasks) {
			this.initializedDependentLeafTasks = true;
			if (this.subTasks.length !== 0) {
				// Distribute the dependent's leaf tasks to all the subtasks
				const dependentLeafTasks = this.collectDependentLeafTasks();
				for (const task of this.subTasks) {
					task.initializeDependentLeafTasks();
					task.addDependentLeafTasks(dependentLeafTasks);
				}
			}
		}
	}

	public collectLeafTasks(leafTasks: Set<LeafTask>) {
		// Returning the leaf task to be uses as dependents.
		if (this.subTasks.length !== 0) {
			// If there are subtasks, then this task's dependencies is already distributed
			// to the subtasks, so we just need to collect the leaf tasks from the subtasks
			// to be used for tasks that are depending on this group task
			for (const task of this.subTasks) {
				task.collectLeafTasks(leafTasks);
			}
		} else {
			// If there is no subtasks, then this task's dependencies is used for
			// tasks that are depending on this group task, collect the leaf task from them
			for (const dependentTask of this.dependentTasks) {
				dependentTask.collectLeafTasks(leafTasks);
			}
		}
	}

	public addDependentLeafTasks(dependentLeafTasks: Iterable<LeafTask>): void {
		for (const task of this.subTasks) {
			task.addDependentLeafTasks(dependentLeafTasks);
		}
	}

	public initializeWeight() {
		assert.strictEqual(this.initializedDependentLeafTasks, true);
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
