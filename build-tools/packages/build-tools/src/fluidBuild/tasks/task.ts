/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncPriorityQueue, priorityQueue } from "async";

import { BuildPackage, BuildResult } from "../buildGraph";
import { options } from "../options";
import { LeafTask } from "./leaf/leafTask";
import * as assert from "assert";
import registerDebug from "debug";

const traceTaskCreate = registerDebug("fluid-build:task:create");

export interface TaskExec {
	task: LeafTask;
	resolve: (value: BuildResult) => void;
}

export abstract class Task {
	private dependentTasks?: Task[];
	private collectedDependentLeafTaskSet?: Set<LeafTask>;
	public static createTaskQueue(): AsyncPriorityQueue<TaskExec> {
		return priorityQueue(async (taskExec: TaskExec) => {
			taskExec.resolve(await taskExec.task.exec());
		}, options.concurrency);
	}

	private runP?: Promise<BuildResult>;
	private isUpToDateP?: Promise<boolean>;

	public get name() {
		return `${this.node.pkg.name}#${this.taskName ?? `<${this.command}>`}`;
	}
	public get nameColored() {
		return `${this.node.pkg.nameColored}#${this.taskName ?? `<${this.command}>`}`;
	}
	protected constructor(
		protected readonly node: BuildPackage,
		public readonly command: string,
		public readonly taskName: string | undefined,
	) {
		traceTaskCreate(`${this.nameColored}`);
	}

	public get package() {
		return this.node.pkg;
	}

	// Initialize dependent tasks and collect newly created tasks to be initialized iteratively
	// See `BuildPackage.createTasks`
	public initializeDependentTasks(pendingInitDep: Task[]) {
		// This function should only be called once
		assert.strictEqual(this.dependentTasks, undefined);
		// This function should only be called by task with task names
		assert.notStrictEqual(this.taskName, undefined);
		this.dependentTasks = this.node.getDependentTasks(this, this.taskName!, pendingInitDep);
	}

	public collectDependentLeafTasks(dependentLeafTasks: Set<LeafTask>) {
		const dependentTasks = this.dependentTasks;
		if (dependentTasks) {
			if (this.collectedDependentLeafTaskSet === undefined) {
				this.collectedDependentLeafTaskSet = new Set();
				for (const dependentTask of dependentTasks) {
					dependentTask.collectDependentLeafTasks(this.collectedDependentLeafTaskSet);
					dependentTask.collectLeafTasks(this.collectedDependentLeafTaskSet);
				}
			}
			this.collectedDependentLeafTaskSet.forEach((value) => dependentLeafTasks.add(value));
		} else {
			assert.strictEqual(this.taskName, undefined);
		}
	}

	public async run(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		if (await this.isUpToDate()) {
			return BuildResult.UpToDate;
		}
		if (!this.runP) {
			this.runP = this.runTask(q);
		}
		return this.runP;
	}

	public async isUpToDate(): Promise<boolean> {
		// Always not up to date if forced
		if (this.forced) {
			return false;
		}
		if (this.isUpToDateP === undefined) {
			this.isUpToDateP = this.checkIsUpToDate();
		}
		return this.isUpToDateP;
	}

	public toString() {
		return `"${this.command}" in ${this.node.pkg.nameColored}`;
	}

	public abstract initializeDependentLeafTasks(): void;
	public abstract collectLeafTasks(leafTasks: Set<LeafTask>);
	public abstract addDependentLeafTasks(dependentTasks: Set<LeafTask>): void;
	protected abstract checkIsUpToDate(): Promise<boolean>;
	protected abstract runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult>;

	public get forced() {
		return options.force && (options.matchedOnly !== true || this.package.matched);
	}
}
