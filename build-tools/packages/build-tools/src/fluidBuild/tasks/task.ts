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
	private dependentTargets?: Task[];
	private collectedDependentTaskSet?: Set<LeafTask>;
	public static createTaskQueue(): AsyncPriorityQueue<TaskExec> {
		return priorityQueue(async (taskExec: TaskExec) => {
			taskExec.resolve(await taskExec.task.exec());
		}, options.concurrency);
	}

	private runP?: Promise<BuildResult>;
	private isUpToDateP?: Promise<boolean>;

	public get name() {
		return `${this.node.pkg.name}#${this.target ?? `<${this.command}>`}`;
	}
	public get nameColored() {
		return `${this.node.pkg.nameColored}#${this.target ?? `<${this.command}>`}`;
	}
	protected constructor(
		protected readonly node: BuildPackage,
		public readonly command: string,
		public readonly target: string | undefined,
	) {
		traceTaskCreate(`${this.nameColored}`);
	}

	public get package() {
		return this.node.pkg;
	}

	// Initialize dependent targets and collect new targets to be initialized iteratively
	// See `BuildPackage.createTasks`
	public initializeDependentTarget(pendingInitDep: Task[]) {
		// This function should only be called once
		assert.strictEqual(this.dependentTargets, undefined);
		// This function should only be called by task with target names
		assert.notStrictEqual(this.target, undefined);
		this.dependentTargets = this.node.getDependentTargets(this, this.target!, pendingInitDep);
	}

	public collectDependentTasks(dependentTasks: Set<LeafTask>) {
		const dependentTargets = this.dependentTargets;
		if (dependentTargets) {
			if (this.collectedDependentTaskSet === undefined) {
				this.collectedDependentTaskSet = new Set();
				for (const dependentTarget of dependentTargets) {
					dependentTarget.collectDependentTasks(this.collectedDependentTaskSet);
					dependentTarget.collectLeafTasks(this.collectedDependentTaskSet);
				}
			}
			this.collectedDependentTaskSet.forEach((value) => dependentTasks.add(value));
		} else {
			assert.strictEqual(this.target, undefined);
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

	public abstract initializeDependentTasks(): void;
	public abstract collectLeafTasks(leafTasks: Set<LeafTask>);
	public abstract addDependentTasks(dependentTasks: Set<LeafTask>): void;
	public abstract get isLeaf(): boolean;
	protected abstract checkIsUpToDate(): Promise<boolean>;
	protected abstract runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult>;

	public get forced() {
		return options.force && (options.matchedOnly !== true || this.package.matched);
	}
}
