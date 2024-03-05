/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncPriorityQueue } from "async";
import chalk from "chalk";
import * as semver from "semver";

import { FileHashCache } from "../common/fileHashCache";
import { defaultLogger } from "../common/logging";
import { Package } from "../common/npmPackage";
import { Timer } from "../common/timer";
import { options } from "./options";
import { Task, TaskExec } from "./tasks/task";
import { TaskFactory } from "./tasks/taskFactory";
import { WorkerPool } from "./tasks/workers/workerPool";
import * as assert from "assert";
import {
	TaskDefinitions,
	TaskDefinitionsOnDisk,
	TaskConfig,
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
} from "../common/fluidTaskDefinitions";
import registerDebug from "debug";

const traceTaskDef = registerDebug("fluid-build:task:definition");
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
	constructor(
		public readonly repoPackageMap: Map<string, Package>,
		public readonly workerPool?: WorkerPool,
	) {}
}

export class BuildPackage {
	private readonly tasks = new Map<string, Task>();

	// track a script task without the lifecycle (pre/post) tasks
	private readonly scriptTasks = new Map<string, Task>();

	public readonly dependentPackages = new Array<BuildPackage>();
	public level: number = -1;
	private buildP?: Promise<BuildResult>;

	// This field shouldn't be used directly, use getTaskDefinition instead
	private readonly _taskDefinitions: TaskDefinitions;

	constructor(
		public readonly buildContext: BuildContext,
		public readonly pkg: Package,
		globalTaskDefinitions: TaskDefinitions,
	) {
		this._taskDefinitions = getTaskDefinitions(
			this.pkg.packageJson,
			globalTaskDefinitions,
			this.pkg.isReleaseGroupRoot,
		);
		traceTaskDef(
			`${pkg.nameColored}: Task def: ${JSON.stringify(this._taskDefinitions, undefined, 2)}`,
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
			.map((value) => this.getTask(value, pendingInitDep))
			.filter((task) => task !== undefined);

		while (pendingInitDep.length !== 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const task = pendingInitDep.pop()!;
			task.initializeDependentTasks(pendingInitDep);
		}

		return tasks.length !== 0;
	}

	private getTaskDefinition(taskName: string): TaskConfig | undefined {
		let taskDefinition = this._taskDefinitions[taskName];
		if (taskDefinition === undefined && this.pkg.isReleaseGroupRoot) {
			const isReleaseGroupRootScriptEnabled =
				this.pkg.packageJson.fluidBuild?.tasks !== undefined;
			const script = this.pkg.getScript(taskName);
			if (
				// Only enable release group root script if it is explicitly defined, for places that don't use it yet
				!isReleaseGroupRootScriptEnabled ||
				// if there is no script or the script starts with "fluid-build", then use the default
				script === undefined ||
				script.startsWith("fluid-build ")
			) {
				// default for release group root is to depend on the task of all packages in the release group
				taskDefinition = {
					dependsOn: [`^${taskName}`],
					script: false,
					before: [],
					after: [],
				};
			}
		}
		return taskDefinition;
	}

	private createTask(taskName: string, pendingInitDep: Task[]) {
		const config = this.getTaskDefinition(taskName);
		if (config?.script === false) {
			const task = TaskFactory.CreateTargetTask(this, taskName);
			pendingInitDep.push(task);
			return task;
		}
		return this.createScriptTask(taskName, pendingInitDep);
	}

	private createScriptTask(taskName: string, pendingInitDep: Task[]) {
		const command = this.pkg.getScript(taskName);
		if (command !== undefined && !command.startsWith("fluid-build ")) {
			// Find the script task (without the lifecycle task)
			let scriptTask = this.scriptTasks.get(taskName);
			if (scriptTask === undefined) {
				scriptTask = TaskFactory.Create(this, command, pendingInitDep, taskName);
				pendingInitDep.push(scriptTask);
				this.scriptTasks.set(taskName, scriptTask);
			}

			// Create the script task with lifecycle task.
			// This will be tracked in the 'tasks' map, and other task that depends on this
			// script task will depend on this instance instead of the standalone script task without the lifecycle.
			const task = TaskFactory.CreateTaskWithLifeCycle(
				this,
				scriptTask,
				this.ensureScriptTask(`pre${taskName}`, pendingInitDep),
				this.ensureScriptTask(`post${taskName}`, pendingInitDep),
			);
			if (task !== scriptTask) {
				// We are doing duplicate work initializeDependentTasks as both the lifecycle task
				// and script task will have the task name and dependency
				pendingInitDep.push(task);
			}
			return task;
		}
		return undefined;
	}

	private ensureScriptTask(taskName: string, pendingInitDep: Task[]) {
		const scriptTask = this.scriptTasks.get(taskName);
		if (scriptTask !== undefined) {
			return scriptTask;
		}
		const command = this.pkg.getScript(taskName);
		if (command === undefined) {
			return undefined;
		}
		const config = this.getTaskDefinition(taskName);
		if (config?.script === false) {
			throw new Error(`${this.pkg.nameColored}: '${taskName}' must be a script task`);
		}

		const task = TaskFactory.Create(this, command, pendingInitDep, taskName);
		pendingInitDep.push(task);
		return task;
	}

	// Create or return and existing task with a name.  If it is a script, it will also create an return the pre/post script task if it exists
	private getTask(taskName: string, pendingInitDep: Task[] | undefined): Task | undefined {
		const existing = this.tasks.get(taskName);
		if (existing) {
			return existing;
		}

		if (pendingInitDep === undefined) {
			// when pendingInitDep is undefined, it means we don't expect to instantiate the reference task
			return undefined;
		}

		const task = this.createTask(taskName, pendingInitDep);
		if (task !== undefined) {
			this.tasks.set(taskName, task);
		}
		return task;
	}

	public getScriptTask(taskName: string, pendingInitDep: Task[]): Task | undefined {
		const config = this.getTaskDefinition(taskName);
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

	public getDependsOnTasks(task: Task, taskName: string, pendingInitDep: Task[]) {
		const taskConfig = this.getTaskDefinition(taskName);
		if (taskConfig === undefined) {
			return [];
		}

		traceTaskDepTask(
			`Expanding dependsOn: ${task.nameColored} -> ${JSON.stringify(taskConfig.dependsOn)}`,
		);
		const matchedTasks = this.getMatchedTasks(taskConfig.dependsOn, pendingInitDep);
		matchedTasks.forEach((matchedTask) => {
			traceTaskDepTask(`${task.nameColored} -> ${matchedTask.nameColored}`);
		});
		return matchedTasks;
	}

	// Create or get the task with names in the `deps` array
	private getMatchedTasks(deps: string[], pendingInitDep?: Task[]) {
		const matchedTasks: Task[] = [];
		for (const dep of deps) {
			// If pendingInitDep is undefined, that mean we don't expect the task to be found, so pretend that we already found it.

			let found = pendingInitDep === undefined;
			// should have be replaced already.
			assert.notStrictEqual(dep, "...");
			if (dep.startsWith("^")) {
				found = true; // Don't worry if we can't find any
				for (const depPackage of this.dependentPackages) {
					const depTask = depPackage.getTask(dep.substring(1), pendingInitDep);
					if (depTask !== undefined) {
						matchedTasks.push(depTask);
					}
				}
			} else if (dep.includes("#")) {
				const [pkg, script] = dep.split("#");
				for (const depPackage of this.dependentPackages) {
					if (pkg === depPackage.pkg.name) {
						const depTask = depPackage.getTask(script, pendingInitDep);
						if (depTask !== undefined) {
							matchedTasks.push(depTask);
							found = true;
						}
						break;
					}
				}
			} else {
				const depTask = this.getTask(dep, pendingInitDep);
				if (depTask !== undefined) {
					matchedTasks.push(depTask);
					found = true;
				}
			}
			if (!found) {
				throw new Error(`${this.pkg.nameColored}: Unable to find dependent '${dep}'`);
			}
		}
		return matchedTasks;
	}

	public finalizeDependentTasks() {
		// Set up the dependencies for "before"
		this.tasks.forEach((task) => {
			if (task.taskName === undefined) {
				return;
			}
			const taskConfig = this.getTaskDefinition(task.taskName);
			if (taskConfig === undefined) {
				return;
			}

			// Expand the star entry to all scheduled tasks
			const expandStar = (
				deps: string[],
				additionalFilter: (depTaskName: string) => boolean,
			) => {
				const newDeps = deps.filter((dep) => dep !== "*");
				if (newDeps.length === deps.length) {
					return newDeps;
				}
				const taskNames = Array.from(this.tasks.keys());
				// avoid circular dependency
				const filteredTaskNames = taskNames.filter(
					(depTaskName) => depTaskName !== task.taskName && additionalFilter(depTaskName),
				);
				return newDeps.concat(filteredTaskNames);
			};

			if (taskConfig.before.length !== 0) {
				// We don't want parent packages to inject dependencies to the child packages,
				// so ^ and # are not supported for 'before'
				const before = expandStar(
					taskConfig.before,
					/* ignore mutual before "*" */
					(depTaskName) => !this.getTaskDefinition(depTaskName)?.before.includes("*"),
				);
				traceTaskDepTask(
					`Expanding before: ${task.nameColored} -> ${JSON.stringify(before)}`,
				);
				const matchedTasks = this.getMatchedTasks(before);
				for (const matchedTask of matchedTasks) {
					traceTaskDepTask(`${matchedTask.nameColored} -> ${task.nameColored}`);
					// initializeDependentTask should have been called on all the task already
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					matchedTask.dependentTasks!.push(task);
				}
			}

			if (taskConfig.after.length !== 0) {
				const after = expandStar(
					taskConfig.after,
					/* ignore mutual after "*" */
					(depTaskName) => !this.getTaskDefinition(depTaskName)?.after.includes("*"),
				);
				traceTaskDepTask(
					`Expanding after: ${task.nameColored} -> ${JSON.stringify(after)}`,
				);
				const matchedTasks = this.getMatchedTasks(taskConfig.after);
				matchedTasks.forEach((matchedTask) => {
					traceTaskDepTask(`${task.nameColored} -> ${matchedTask.nameColored}`);
				});
				// initializeDependentTask should have been called on all the task already
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				task.dependentTasks!.push(...matchedTasks);
			}
		});
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

	public async getLockFileHash() {
		const lockfile = this.pkg.getLockFilePath();
		if (lockfile) {
			return this.buildContext.fileHashCache.getFileHash(lockfile);
		}
		throw new Error("Lock file not found");
	}
}

/**
 * BuildGraph is a representation of all the tasks and the dependent order
 * specified by the task definitions.
 *
 * To create the graph:
 * 1. Initialize BuildPackages
 * 	  a. Create the BuildPackage nodes for packages that are matched (on the command line)
 *       and then transitively create dependent packages as needed. Not all repo packages
 *       will have a BuildPackage created.
 *    b. Detect if there is a circular dependency by assign level to packages. The package
 *       level has no other use currently.
 * 2. Tasks and dependencies graph
 *    a. Create the initial task specified on the command line.  Without --dep option, the
 *       the initial task will only for created for matched BuildPackages. With --dep option
 *       the initial task will be created for all instantiated BuildPackages (i.e. all the
 *       package that is transitive dependencies of the matched BuildPackages).
 *	  b. Transitively resolve and create dependent tasks starting from the initial tasks
 *       based on the `dependsOn` specified in the TaskDefinitions
 *    c. Resolve all `before` and `after` dependencies to tasks that is already instantiated.
 * 	     `before` and `after` doesn't cause new task to be created, only match to existing tasks.
 * 3. Initialize gather up all the leaf tasks dependencies.
 * 4. Assign tasks weight to prioritize tasks based on how expansive the tasks depending on
 *    this one will unblock.
 */
export class BuildGraph {
	private matchedPackages = 0;
	private readonly buildPackages = new Map<Package, BuildPackage>();
	private readonly buildContext;

	public constructor(
		packages: Map<string, Package>,
		releaseGroupPackages: Package[],
		private readonly buildTaskNames: string[],
		globalTaskDefinitions: TaskDefinitionsOnDisk | undefined,
		getDepFilter: (pkg: Package) => (dep: Package) => boolean,
	) {
		this.buildContext = new BuildContext(
			packages,
			options.worker
				? new WorkerPool(options.workerThreads, options.workerMemoryLimit)
				: undefined,
		);
		this.initializePackages(
			packages,
			releaseGroupPackages,
			globalTaskDefinitions,
			getDepFilter,
		);
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
		let hasError = false;
		q.error((err, task) => {
			console.error(
				`${task.task.nameColored}: Internal uncaught exception: ${err}\n${err.stack}`,
			);
			hasError = true;
		});
		try {
			this.buildPackages.forEach((node) => {
				p.push(node.build(q));
			});
			await q.drain();
			if (hasError) {
				return BuildResult.Failed;
			}
			return summarizeBuildResult(await Promise.all(p));
		} finally {
			this.buildContext.workerPool?.reset();
		}
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
		globalTaskDefinitions: TaskDefinitions,
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
		releaseGroupPackages: Package[],
		globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk | undefined,
		getDepFilter: (pkg: Package) => (dep: Package) => boolean,
	) {
		const globalTaskDefinitions = normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk);
		const pendingInitDep: BuildPackage[] = [];
		for (const pkg of packages.values()) {
			// Start with only matched packages
			if (pkg.matched) {
				this.getBuildPackage(pkg, globalTaskDefinitions, pendingInitDep);
			}
		}

		for (const releaseGroupPackage of releaseGroupPackages) {
			// Start with only matched packages
			if (releaseGroupPackage.matched) {
				this.getBuildPackage(releaseGroupPackage, {}, pendingInitDep);
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
			if (node.pkg.isReleaseGroupRoot) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				for (const dep of node.pkg.monoRepo!.packages) {
					traceGraph(`Package dependency: ${node.pkg.nameColored} => ${dep.nameColored}`);
					node.dependentPackages.push(
						this.getBuildPackage(dep, globalTaskDefinitions, pendingInitDep),
					);
				}
				continue;
			}
			const depFilter = getDepFilter(node.pkg);
			for (const { name, version } of node.pkg.combinedDependencies) {
				const dep = packages.get(name);
				if (dep) {
					const satisfied =
						version.startsWith("workspace:") || semver.satisfies(dep.version, version);
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

		// All the transitive task has been created, finalize "soft" dependent edges and before/after tasks
		this.buildPackages.forEach((node) => {
			node.finalizeDependentTasks();
		});

		traceGraph("dependent task initialized");

		// All the tasks and dependency has been initialized, now initialize the leaf graph (which is used in build)
		this.buildPackages.forEach((node) => {
			node.initializeDependentLeafTasks();
		});

		traceGraph("dependent leaf task initialized");

		// Leaf graph is completed. Compute the weight
		this.buildPackages.forEach((node) => {
			node.initializeWeight();
		});

		traceGraph("task weight initialized");
	}
}
