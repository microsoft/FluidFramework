/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncPriorityQueue } from "async";
import chalk from "chalk";
import * as semver from "semver";

import { FileHashCache } from "../common/fileHashCache";
import { defaultLogger } from "../common/logging";
import { Package, Packages } from "../common/npmPackage";
import { Timer } from "../common/timer";
import { options } from "./options";
import { Task, TaskExec } from "./tasks/task";
import { TaskFactory } from "./tasks/taskFactory";
import { WorkerPool } from "./tasks/workers/workerPool";
import * as assert from "assert";
import {
	TaskDefinitions,
	TaskDefinitionsOnDisk,
	getTaskDefinitions,
} from "../common/fluidTaskDefinitions";
import registerDebug from "debug";

const traceBuildPackageCreate = registerDebug("fluid-build:package:create");
const traceTaskDepTask = registerDebug("fluid-build:task:init:dep:task");
const traceGraph = registerDebug("fluid-build:graph");

const { log } = defaultLogger;

export enum BuildResult {
	Success,
	UpToDate,
	Failed,
}

export function summarizeBuildResult(results: BuildResult[]) {
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

class TaskStats {
	public leafTotalCount = 0;
	public leafUpToDateCount = 0;
	public leafBuiltCount = 0;
	public leafExecTimeTotal = 0;
	public leafQueueWaitTimeTotal = 0;
}

class BuildContext {
	public readonly fileHashCache = new FileHashCache();
	public readonly taskStats = new TaskStats();
	public readonly failedTaskLines: string[] = [];
	constructor(public readonly workerPool?: WorkerPool) {}
}

export class BuildPackage {
	private tasks = new Map<string, Task>();
	public readonly dependentPackages = new Array<BuildPackage>();
	public level: number = -1;
	private buildP?: Promise<BuildResult>;
	private readonly taskDefinitions: TaskDefinitions;

	constructor(
		public readonly buildContext: BuildContext,
		public readonly pkg: Package,
		globalTaskDefinitions: TaskDefinitionsOnDisk | undefined,
	) {
		this.taskDefinitions = getTaskDefinitions(this.pkg.packageJson, globalTaskDefinitions);
		traceBuildPackageCreate(
			`${pkg.nameColored}: created. Task def: ${JSON.stringify(
				this.taskDefinitions,
				undefined,
				2,
			)}`,
		);
	}

	public get taskCount() {
		return this.tasks.size;
	}

	public createTasks(buildTaskNames: string[]) {
		const taskNames = buildTaskNames;
		if (taskNames.length === 0) {
			return undefined;
		}

		const pendingInitDep: Task[] = [];
		const tasks = taskNames
			.map((value) => this.getTask(value, pendingInitDep)!)
			.filter((task) => task !== undefined);

		while (pendingInitDep.length !== 0) {
			const task = pendingInitDep.pop()!;
			task.initializeDependentTasks(pendingInitDep);
		}

		return tasks.length !== 0;
	}

	private createTask(taskName: string, pendingInitDep: Task[]) {
		const config = this.taskDefinitions[taskName];
		if (config?.script === false) {
			const task = TaskFactory.CreateTargetTask(this, taskName);
			pendingInitDep.push(task);
			return task;
		}
		return this.createScriptTask(taskName, pendingInitDep);
	}

	private createScriptTask(taskName: string, pendingInitDep: Task[]) {
		const command = this.pkg.getScript(taskName);
		if (command !== undefined) {
			const task = TaskFactory.Create(this, command, pendingInitDep, taskName);
			pendingInitDep.push(task);
			return task;
		}
		return undefined;
	}

	private getTask(taskName: string, pendingInitDep: Task[]): Task | undefined {
		const existing = this.tasks.get(taskName);
		if (existing) {
			return existing;
		}

		const task = this.createTask(taskName, pendingInitDep);
		if (task !== undefined) {
			this.tasks.set(taskName, task);
		}
		return task;
	}

	public getScriptTask(taskName: string, pendingInitDep: Task[]): Task | undefined {
		const config = this.taskDefinitions[taskName];
		if (config?.script === false) {
			// it is not a script task
			return undefined;
		}
		const existing = this.tasks.get(taskName);
		if (existing) {
			return existing;
		}

		const task = this.createScriptTask(taskName, pendingInitDep);
		if (task !== undefined) {
			this.tasks.set(taskName, task);
		}
		return task;
	}

	public getDependentTasks(task: Task, taskName: string, pendingInitDep: Task[]) {
		const dependentTasks: Task[] = [];
		const taskConfig = this.taskDefinitions[taskName];
		if (taskConfig === undefined) {
			return dependentTasks;
		}

		traceTaskDepTask(`${task.nameColored} -> ${JSON.stringify(taskConfig.dependsOn)}`);
		for (const dep of taskConfig.dependsOn) {
			let found = false;
			// should have be replaced already.
			assert.notStrictEqual(dep, "...");
			if (dep.startsWith("^")) {
				found = true; // Don't worry if we can't find any
				for (const depPackage of this.dependentPackages) {
					const depTask = depPackage.getTask(dep.substring(1), pendingInitDep);
					if (depTask !== undefined) {
						traceTaskDepTask(`${task.nameColored} -> ${depTask.nameColored}`);
						dependentTasks.push(depTask);
					}
				}
			} else if (dep.includes("#")) {
				const [pkg, script] = dep.split("#");
				for (const depPackage of this.dependentPackages) {
					if (pkg === depPackage.pkg.name) {
						const depTask = depPackage.getTask(script, pendingInitDep);
						if (depTask !== undefined) {
							traceTaskDepTask(`${task.nameColored} -> ${depTask.nameColored}`);
							dependentTasks.push(depTask);
							found = true;
						}
						break;
					}
				}
			} else {
				const depTask = this.getTask(dep, pendingInitDep);
				if (depTask !== undefined) {
					traceTaskDepTask(`${task.nameColored} -> ${depTask.nameColored}`);
					dependentTasks.push(depTask);
					found = true;
				}
			}
			if (!found) {
				throw new Error(`${this.pkg.nameColored}: Unable to find dependent '${dep}'`);
			}
		}

		return dependentTasks;
	}

	public initializeDependentLeafTasks() {
		this.tasks.forEach((task) => {
			task.initializeDependentLeafTasks();
		});
	}

	public initializeWeight() {
		this.tasks.forEach((task) => {
			task.initializeWeight();
		});
	}

	public async isUpToDate(): Promise<boolean> {
		if (this.tasks.size == 0) {
			return true;
		}
		const isUpToDateP = new Array<Promise<boolean>>();
		for (const task of this.tasks.values()) {
			isUpToDateP.push(task.isUpToDate());
		}
		const isUpToDateArr = await Promise.all(isUpToDateP);
		return isUpToDateArr.every((isUpToDate) => isUpToDate);
	}

	private async buildAllTasks(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		const runP: Promise<BuildResult>[] = [];
		for (const task of this.tasks.values()) {
			runP.push(task.run(q));
		}
		return summarizeBuildResult(await Promise.all(runP));
	}
	public async build(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		if (!this.buildP) {
			if (this.tasks.size !== 0) {
				this.buildP = this.buildAllTasks(q);
			} else {
				this.buildP = Promise.resolve(BuildResult.UpToDate);
			}
		}
		return this.buildP;
	}
}

export class BuildGraph {
	private matchedPackages = 0;
	private readonly buildPackages = new Map<Package, BuildPackage>();
	private readonly buildContext = new BuildContext(
		options.worker
			? new WorkerPool(options.workerThreads, options.workerMemoryLimit)
			: undefined,
	);

	public constructor(
		packages: Map<string, Package>,
		private readonly buildTaskNames: string[],
		globalTaskDefinitions: TaskDefinitionsOnDisk | undefined,
		getDepFilter: (pkg: Package) => (dep: Package) => boolean,
	) {
		this.initializePackages(packages, globalTaskDefinitions, getDepFilter);
		this.populateLevel();
		this.initializeTasks(buildTaskNames);
	}

	private async isUpToDate() {
		const isUpToDateP = new Array<Promise<boolean>>();
		this.buildPackages.forEach((node) => {
			isUpToDateP.push(node.isUpToDate());
		});
		const isUpToDateArr = await Promise.all(isUpToDateP);
		return isUpToDateArr.every((isUpToDate) => isUpToDate);
	}

	public async checkInstall() {
		let succeeded = true;
		for (const buildPackage of this.buildPackages.values()) {
			if (!(await buildPackage.pkg.checkInstall())) {
				succeeded = false;
			}
		}
		return succeeded;
	}

	public async build(timer?: Timer): Promise<BuildResult> {
		// TODO: This function can only be called once
		const isUpToDate = await this.isUpToDate();
		if (timer) timer.time(`Check up to date completed`);

		log(
			`Start tasks '${chalk.cyanBright(this.buildTaskNames.join("', '"))}' in ${
				this.matchedPackages
			} matched packages (${this.buildContext.taskStats.leafTotalCount} total tasks in ${
				this.buildPackages.size
			} packages)`,
		);
		if (isUpToDate) {
			return BuildResult.UpToDate;
		}
		if (this.numSkippedTasks) {
			log(`Skipping ${this.numSkippedTasks} up to date tasks.`);
		}
		this.buildContext.fileHashCache.clear();
		const q = Task.createTaskQueue();
		const p: Promise<BuildResult>[] = [];
		try {
			this.buildPackages.forEach((node) => {
				p.push(node.build(q));
			});

			return summarizeBuildResult(await Promise.all(p));
		} finally {
			this.buildContext.workerPool?.reset();
		}
	}

	public async clean() {
		const cleanPackages: Package[] = [];
		this.buildPackages.forEach((node) => {
			if (options.matchedOnly === true && !node.pkg.matched) {
				return;
			}
			cleanPackages.push(node.pkg);
		});
		return Packages.clean(cleanPackages, true);
	}

	public get numSkippedTasks(): number {
		return this.buildContext.taskStats.leafUpToDateCount;
	}

	public get totalElapsedTime(): number {
		return this.buildContext.taskStats.leafExecTimeTotal;
	}

	public get totalQueueWaitTime(): number {
		return this.buildContext.taskStats.leafQueueWaitTimeTotal;
	}

	public get taskFailureSummary(): string {
		if (this.buildContext.failedTaskLines.length === 0) {
			return "";
		}
		const summaryLines = this.buildContext.failedTaskLines;
		const notRunCount =
			this.buildContext.taskStats.leafTotalCount -
			this.buildContext.taskStats.leafUpToDateCount -
			this.buildContext.taskStats.leafBuiltCount;
		summaryLines.unshift(chalk.redBright("Failed Tasks:"));
		summaryLines.push(chalk.yellow(`Did not run ${notRunCount} tasks due to prior failures.`));
		return summaryLines.join("\n");
	}

	private getBuildPackage(
		pkg: Package,
		globalTaskDefinitions: TaskDefinitionsOnDisk | undefined,
		pendingInitDep: BuildPackage[],
	) {
		let buildPackage = this.buildPackages.get(pkg);
		if (buildPackage === undefined) {
			try {
				buildPackage = new BuildPackage(this.buildContext, pkg, globalTaskDefinitions);
			} catch (e: unknown) {
				throw new Error(
					`${pkg.nameColored}: Failed to load build package in ${pkg.directory}\n\t${
						(e as Error).message
					}`,
				);
			}
			this.buildPackages.set(pkg, buildPackage);
			pendingInitDep.push(buildPackage);
		}
		return buildPackage;
	}

	private initializePackages(
		packages: Map<string, Package>,
		globalTaskDefinitions: TaskDefinitionsOnDisk | undefined,
		getDepFilter: (pkg: Package) => (dep: Package) => boolean,
	) {
		const pendingInitDep: BuildPackage[] = [];
		for (const pkg of packages.values()) {
			// Start with only matched packages
			if (pkg.matched) {
				this.getBuildPackage(pkg, globalTaskDefinitions, pendingInitDep);
			}
		}

		traceGraph("package created");

		// Create all the dependent packages
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const node = pendingInitDep.pop();
			if (node === undefined) {
				break;
			}
			const depFilter = getDepFilter(node.pkg);
			for (const { name, version } of node.pkg.combinedDependencies) {
				const dep = packages.get(name);
				if (dep) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const satisfied =
						version!.startsWith("workspace:") ||
						semver.satisfies(dep.version, version!);
					if (satisfied) {
						if (depFilter(dep)) {
							traceGraph(
								`Package dependency: ${node.pkg.nameColored} => ${dep.nameColored}`,
							);
							node.dependentPackages.push(
								this.getBuildPackage(dep, globalTaskDefinitions, pendingInitDep),
							);
						} else {
							traceGraph(
								`Package dependency skipped: ${node.pkg.nameColored} => ${dep.nameColored}`,
							);
						}
					} else {
						traceGraph(
							`Package dependency version mismatch: ${node.pkg.nameColored} => ${dep.nameColored}`,
						);
					}
				}
			}
		}
		traceGraph("package dependencies initialized");
	}

	private populateLevel() {
		// level is not strictly necessary, except for circular reference.
		const getLevel = (node: BuildPackage, parent?: BuildPackage) => {
			if (node.level === -2) {
				throw new Error(
					`Circular Reference detected ${parent ? parent.pkg.nameColored : "<none>"} -> ${
						node.pkg.nameColored
					}`,
				);
			}
			if (node.level !== -1) {
				return node.level;
			} // populated
			node.level = -2;
			let maxChildrenLevel = -1;
			node.dependentPackages.forEach((child) => {
				maxChildrenLevel = Math.max(maxChildrenLevel, getLevel(child, node));
			});
			node.level = maxChildrenLevel + 1;
			return maxChildrenLevel + 1;
		};

		this.buildPackages.forEach((node) => {
			getLevel(node);
		});
		traceGraph("package dependency level initialized");
	}

	private initializeTasks(buildTaskNames: string[]) {
		let hasTask = false;
		this.buildPackages.forEach((node) => {
			if (options.matchedOnly && !node.pkg.matched) {
				// Don't initialize task on package that wasn't matched in matchedOnly mode
				return;
			}

			this.matchedPackages++;

			// Initialize tasks
			if (node.createTasks(buildTaskNames)) {
				hasTask = true;
			}
		});

		if (!hasTask) {
			throw new Error(`No task(s) found for '${this.buildTaskNames.join()}'`);
		}

		traceGraph("package task initialized");

		// All the task has been created, initialize the dependent tasks
		this.buildPackages.forEach((node) => {
			node.initializeDependentLeafTasks();
		});

		traceGraph("dependent task initialized");

		// All the task has been created, initialize the dependent tasks
		this.buildPackages.forEach((node) => {
			node.initializeWeight();
		});

		traceGraph("task weight initialized");
	}
}
