/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncPriorityQueue, priorityQueue } from "async";

import * as assert from "assert";
import registerDebug from "debug";
import type { BuildContext } from "../buildContext";
import { BuildPackage, BuildResult } from "../buildGraph";
import { options } from "../options";
import { LeafTask } from "./leaf/leafTask";

const traceTaskInit = registerDebug("fluid-build:task:init");
const traceTaskExec = registerDebug("fluid-build:task:exec");
const traceTaskExecWait = registerDebug("fluid-build:task:exec:wait");
const traceTaskDepTask = registerDebug("fluid-build:task:init:dep:task");

export interface TaskExec {
	task: LeafTask;
	resolve: (value: BuildResult) => void;
	queueTime: number;
}

export abstract class Task {
	private dependentTasks?: Task[];
	private _transitiveDependentLeafTasks: LeafTask[] | undefined | null;
	public static createTaskQueue(): AsyncPriorityQueue<TaskExec> {
		return priorityQueue(async (taskExec: TaskExec) => {
			const waitTime = (Date.now() - taskExec.queueTime) / 1000;
			const task = taskExec.task;
			task.node.context.taskStats.leafQueueWaitTimeTotal += waitTime;
			traceTaskExecWait(`${task.nameColored}: waited in queue ${waitTime}s`);
			taskExec.resolve(await task.exec());
			// wait one more turn so that we can queue up dependents we just freed up
			// before giving up the time slice, so that they can be considered for next tasks
			await new Promise(setImmediate);
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
		protected readonly context: BuildContext,
		public readonly taskName: string | undefined,
	) {
		traceTaskInit(`${this.nameColored}`);
		if (this.taskName === undefined) {
			// initializeDependentTasks won't be called for unnamed tasks
			this.dependentTasks = [];
		}
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.dependentTasks = this.node.getDependsOnTasks(this, this.taskName!, pendingInitDep);
	}

	// Add dependent task. For group tasks, propagate to unnamed subtask only if it's a default dependency
	public addDependentTasks(dependentTasks: Task[], isDefault?: boolean) {
		if (traceTaskDepTask.enabled) {
			dependentTasks.forEach((dependentTask) => {
				traceTaskDepTask(
					`${this.nameColored} -> ${dependentTask.nameColored}${
						isDefault === true ? " (default)" : ""
					}`,
				);
			});
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.dependentTasks!.push(...dependentTasks);
	}

	protected get transitiveDependentLeafTask() {
		if (this._transitiveDependentLeafTasks === null) {
			// Circular dependency, start unrolling
			throw [this];
		}
		try {
			if (this._transitiveDependentLeafTasks === undefined) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const dependentTasks = this.dependentTasks!;
				assert.notStrictEqual(dependentTasks, undefined);
				this._transitiveDependentLeafTasks = null;

				const s = new Set<LeafTask>();
				for (const dependentTask of dependentTasks) {
					dependentTask.transitiveDependentLeafTask.forEach((t) => s.add(t));
					dependentTask.collectLeafTasks(s);
				}
				this._transitiveDependentLeafTasks = [...s.values()];
			}
			return this._transitiveDependentLeafTasks;
		} catch (e) {
			if (Array.isArray(e)) {
				// Add to the dependency chain
				e.push(this);
				if (e[0] === this) {
					// detected a cycle, convert into a message
					throw new Error(
						`Circular dependency in dependent tasks: ${e
							.map((v) => v.nameColored)
							.join("->")}`,
					);
				}
			}
			throw e;
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
	public abstract addDependentLeafTasks(dependentTasks: Iterable<LeafTask>): void;
	public abstract initializeWeight(): void;

	protected abstract checkIsUpToDate(): Promise<boolean>;
	protected abstract runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult>;

	public get forced() {
		return options.force && (options.matchedOnly !== true || this.package.matched);
	}

	protected traceExec(msg: string) {
		traceTaskExec(`${this.nameColored}: ${msg}`);
	}
}
