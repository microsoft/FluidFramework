/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import crypto from "crypto";
import * as path from "path";
import { AsyncPriorityQueue } from "async";
import registerDebug from "debug";
import chalk from "picocolors";

import { existsSync } from "node:fs";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { defaultLogger } from "../../../common/logging";
import { ExecAsyncResult, execAsync, getExecutableFromCommand } from "../../../common/utils";
import type { BuildContext } from "../../buildContext";
import { BuildPackage, BuildResult, summarizeBuildResult } from "../../buildGraph";
import { options } from "../../options";
import { Task, TaskExec } from "../task";

const { log } = defaultLogger;
const traceTaskTrigger = registerDebug("fluid-build:task:trigger");
const traceTaskCheck = registerDebug("fluid-build:task:check");
const traceTaskInitDep = registerDebug("fluid-build:task:init:dep");
const traceTaskInitWeight = registerDebug("fluid-build:task:init:weight");
const traceTaskQueue = registerDebug("fluid-build:task:exec:queue");
const traceError = registerDebug("fluid-build:task:error");

interface TaskExecResult extends ExecAsyncResult {
	worker?: boolean;
}

export abstract class LeafTask extends Task {
	// initialize during initializeDependentLeafTasks
	private dependentLeafTasks?: Set<LeafTask>;

	// set of direct parent that this task will unblock
	private directParentLeafTasks: LeafTask[] = [];
	private _parentLeafTasks: Set<LeafTask> | undefined | null;
	private parentWeight = -1;

	// For task that needs to override the actual command to execute
	protected get executionCommand() {
		return this.command;
	}

	constructor(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName: string | undefined,
		private readonly isTemp: boolean = false, // indicate if the task is for temporary and not for execution.
	) {
		super(node, command, context, taskName);
		if (!this.isDisabled) {
			this.node.context.taskStats.leafTotalCount++;
		}
	}

	public initializeDependentLeafTasks() {
		this.ensureDependentLeafTasks();
	}

	private ensureDependentLeafTasks() {
		if (this.dependentLeafTasks === undefined) {
			this.dependentLeafTasks = new Set();
			this.addDependentLeafTasks(this.transitiveDependentLeafTask);
		}
		return this.dependentLeafTasks;
	}

	public addDependentLeafTasks(dependentLeafTasks: Iterable<LeafTask>): void {
		const dependentLeafTaskSet = this.ensureDependentLeafTasks();
		for (const task of dependentLeafTasks) {
			if (!dependentLeafTaskSet.has(task)) {
				dependentLeafTaskSet.add(task);
				task.directParentLeafTasks.push(this);
				traceTaskInitDep(`${this.nameColored} -> ${task.nameColored}`);
			}
		}
	}

	public collectLeafTasks(leafTasks: Set<LeafTask>) {
		leafTasks.add(this);
	}

	public initializeWeight() {
		if (this.parentWeight === -1) {
			this.parentWeight = this.computeParentWeight() + this.taskWeight;
			traceTaskInitWeight(`${this.nameColored}: ${this.parentWeight}`);
		}
		return this.parentWeight;
	}

	private computeParentWeight() {
		let sum = 0;
		for (const t of this.parentLeafTasks.values()) {
			sum += t.taskWeight;
		}
		return sum;
	}

	// Gather all tasks that depending on this task, so we can use it compute the weight.
	// Collecting  to make sure we don't double count the weight of the same task
	private get parentLeafTasks(): Set<LeafTask> {
		if (this._parentLeafTasks === null) {
			// Circular dependency, start unrolling
			throw [this];
		}
		try {
			if (this._parentLeafTasks === undefined) {
				const parentLeafTasks = new Set<LeafTask>(this.directParentLeafTasks);
				this._parentLeafTasks = null;
				this.directParentLeafTasks
					.map((task) => task.parentLeafTasks)
					.forEach((p) => p.forEach((t) => parentLeafTasks.add(t)));
				this._parentLeafTasks = parentLeafTasks;
			}
			return this._parentLeafTasks;
		} catch (e) {
			if (Array.isArray(e)) {
				// Add to the dependency chain
				e.push(this);
				if (e[0] === this) {
					// detected a cycle, convert into a message
					throw new Error(
						`Circular dependency in parent leaf tasks: ${e
							.map((v) => v.nameColored)
							.join("->")}`,
					);
				}
			}
			throw e;
		}
	}

	protected get taskWeight() {
		return 1;
	}

	public get weight() {
		assert.notStrictEqual(this.parentWeight, -1);
		return this.parentWeight;
	}

	public get isDisabled() {
		if (this.isTemp) {
			return true;
		}
		const isLintTask = this.executable === "eslint" || this.executable === "prettier";
		return (options.nolint && isLintTask) || (options.lintonly && !isLintTask);
	}

	public get executable() {
		return getExecutableFromCommand(
			this.command,
			this.context.fluidBuildConfig?.multiCommandExecutables ?? [],
		);
	}

	protected get useWorker() {
		return false;
	}
	public async exec(): Promise<BuildResult> {
		if (this.isDisabled) {
			return BuildResult.UpToDate;
		}
		if (options.showExec) {
			this.node.context.taskStats.leafBuiltCount++;
			const totalTask =
				this.node.context.taskStats.leafTotalCount -
				this.node.context.taskStats.leafUpToDateCount;
			const taskNum = this.node.context.taskStats.leafBuiltCount
				.toString()
				.padStart(totalTask.toString().length, " ");
			log(`[${taskNum}/${totalTask}] ${this.node.pkg.nameColored}: ${this.command}`);
		}
		const startTime = Date.now();
		if (this.recheckLeafIsUpToDate && !this.forced && (await this.checkLeafIsUpToDate())) {
			return this.execDone(startTime, BuildResult.UpToDate);
		}
		const ret = await this.execCore();

		if (ret.error) {
			const codeStr = ret.error.code !== undefined ? ` (exit code ${ret.error.code})` : "";
			console.error(
				`${this.node.pkg.nameColored}: error during command '${this.command}'${codeStr}`,
			);
			console.error(this.getExecErrors(ret));
			return this.execDone(startTime, BuildResult.Failed);
		}
		if (ret.stderr) {
			// no error code but still error messages, treat them is non fatal warnings
			console.warn(`${this.node.pkg.nameColored}: warning during command '${this.command}'`);
			console.warn(this.getExecErrors(ret));
		}

		await this.markExecDone();
		return this.execDone(startTime, BuildResult.Success, ret.worker);
	}

	private async execCore(): Promise<TaskExecResult> {
		const workerPool = this.node.context.workerPool;
		if (workerPool && this.useWorker) {
			const workerResult = await workerPool.runOnWorker(
				this.executable,
				this.executionCommand,
				this.node.pkg.directory,
			);
			if (workerResult.code === 0 || !workerResult.error) {
				return {
					error:
						workerResult.code === 0
							? null
							: {
									name: "Worker error",
									message: "Worker error",
									cmd: this.executionCommand,
									code: workerResult.code,
								},
					stdout: workerResult.stdout ?? "",
					stderr: workerResult.stderr ?? "",
					worker: true,
				};
			}
			// rerun on the main thread in case the work has an unknown exception
			const result = await this.execCommand();
			if (!result.error) {
				console.warn(
					`${this.node.pkg.nameColored}: warning: worker failed with code ${workerResult.code} but succeeded directly '${this.command}'`,
				);
				if (workerResult.error) {
					if (workerResult.error.stack) {
						console.warn(workerResult.error.stack);
					} else {
						console.warn(`${workerResult.error.name}: ${workerResult.error.message}`);
					}
				}
			}
			return result;
		}
		return this.execCommand();
	}

	private async execCommand(): Promise<ExecAsyncResult> {
		if (this.executionCommand === "") {
			return { error: null, stdout: "", stderr: "" };
		}
		return execAsync(this.executionCommand, {
			cwd: this.node.pkg.directory,
			env: {
				...process.env,
				PATH: `${path.join(this.node.pkg.directory, "node_modules", ".bin")}${path.delimiter}${
					process.env["PATH"]
				}`,
			},
		});
	}

	private getExecErrors(ret: ExecAsyncResult) {
		let errorMessages = ret.stdout;
		if (ret.stderr) {
			errorMessages = `${errorMessages}\n${ret.stderr}`;
		}
		errorMessages = errorMessages.trim();
		if (options.vscode) {
			errorMessages = this.getVsCodeErrorMessages(errorMessages);
		} else {
			errorMessages = errorMessages.replace(/\n/g, `\n${this.node.pkg.nameColored}: `);
			errorMessages = `${this.node.pkg.nameColored}: ${errorMessages}`;
		}
		return errorMessages;
	}

	private execDone(startTime: number, status: BuildResult, worker?: boolean) {
		if (!options.showExec) {
			let statusCharacter: string = " ";
			switch (status) {
				case BuildResult.Success:
					statusCharacter = chalk.greenBright("\u2713");
					break;
				case BuildResult.UpToDate:
					statusCharacter = chalk.cyanBright("-");
					break;
				case BuildResult.Failed:
					statusCharacter = chalk.redBright("x");
					break;
			}

			this.node.context.taskStats.leafBuiltCount++;
			const totalTask =
				this.node.context.taskStats.leafTotalCount -
				this.node.context.taskStats.leafUpToDateCount;
			const taskNum = this.node.context.taskStats.leafBuiltCount
				.toString()
				.padStart(totalTask.toString().length, " ");
			const elapsedTime = (Date.now() - startTime) / 1000;
			const workerMsg = worker ? "[worker] " : "";
			const suffix = this.isIncremental ? "" : " (non-incremental)";
			const statusString = `[${taskNum}/${totalTask}] ${statusCharacter} ${
				this.node.pkg.nameColored
			}: ${workerMsg}${this.command} - ${elapsedTime.toFixed(3)}s${suffix}`;
			log(statusString);
			if (status === BuildResult.Failed) {
				this.node.context.failedTaskLines.push(statusString);
			}
			this.node.context.taskStats.leafExecTimeTotal += elapsedTime;
		}
		return status;
	}

	protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		this.traceExec("Begin Leaf Task");

		// Build all the dependent tasks first
		const result = await this.buildDependentTask(q);
		if (result === BuildResult.Failed) {
			return BuildResult.Failed;
		}

		// Queue this task
		return new Promise((resolve) => {
			traceTaskQueue(`${this.nameColored}: queued with weight ${this.weight}`);
			q.push({ task: this, resolve, queueTime: Date.now() }, -this.weight);
		});
	}

	protected async checkIsUpToDate(): Promise<boolean> {
		if (this.isDisabled) {
			// disabled task are not included in the leafTotalCount
			// so we don't need to update the leafUpToDateCount as well. Just return.
			return true;
		}
		if (options.lintonly) {
			return false;
		}

		if (!(await this.checkDependentLeafTasksIsUpToDate())) {
			return false;
		}

		const start = Date.now();
		const leafIsUpToDate = await this.checkLeafIsUpToDate();
		traceTaskCheck(`${this.nameColored}: checkLeafIsUpToDate: ${Date.now() - start}ms`);
		if (leafIsUpToDate) {
			this.node.context.taskStats.leafUpToDateCount++;
			this.traceExec(`Skipping Leaf Task`);
		}

		return leafIsUpToDate;
	}

	private async checkDependentLeafTasksIsUpToDate(): Promise<boolean> {
		const dependentLeafTasks = this.getDependentLeafTasks();
		for (const dependentLeafTask of dependentLeafTasks) {
			if (!(await dependentLeafTask.isUpToDate())) {
				this.traceTrigger(`dependent task ${dependentLeafTask.toString()} not up to date`);
				return false;
			}
		}
		return true;
	}

	protected getDependentLeafTasks() {
		assert.notStrictEqual(this.dependentLeafTasks, undefined);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.dependentLeafTasks!.values();
	}

	private async buildDependentTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		const p = new Array<Promise<BuildResult>>();
		for (const dependentLeafTask of this.getDependentLeafTasks()) {
			p.push(dependentLeafTask.run(q));
		}

		return summarizeBuildResult(await Promise.all(p));
	}

	/**
	 * Returns the absolute path to a package-relative path within the repo.
	 *
	 * @param filePath - a path relative to the package being processed by this task.
	 * @returns An absolute path to the file.
	 */
	protected getPackageFileFullPath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}
		return path.join(this.node.pkg.directory, filePath);
	}

	/**
	 * Subclass should override these to configure the leaf task
	 */

	// After the task is done, indicate whether the command can be incremental next time.
	protected abstract get isIncremental();

	// check if this task is up to date
	protected abstract checkLeafIsUpToDate(): Promise<boolean>;

	/**
	 * Return if the task supports recheck when it time to execute.
	 * Default to false so that the task will execute if any of the dependent task is out of date at the
	 * beginning of the build.
	 * Override to true if the task knows all the input dependencies (e.g. tsc) and is able to detect if
	 * the dependent task's output changes this tasks' input and really need rebuild or not.
	 */
	protected get recheckLeafIsUpToDate(): boolean {
		return false;
	}

	// For called when the task has successfully executed
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	protected async markExecDone(): Promise<void> {}

	protected getVsCodeErrorMessages(errorMessages: string) {
		return errorMessages;
	}

	protected traceNotUpToDate() {
		this.traceTrigger("not up to date");
	}

	protected traceTrigger(reason: string) {
		const msg = `${this.nameColored}: [${reason}]`;
		traceTaskTrigger(msg);
	}

	protected traceError(msg: string) {
		traceError(`${this.nameColored}: ${msg}`);
	}
}

/**
 * A LeafTask with a "done file" which represents the work this task needs to do.
 */
export abstract class LeafWithDoneFileTask extends LeafTask {
	private _isIncremental: boolean = true;

	protected get isIncremental() {
		return this._isIncremental;
	}
	protected get doneFileFullPath() {
		return this.getPackageFileFullPath(this.doneFile);
	}

	protected async checkIsUpToDate(): Promise<boolean> {
		const leafIsUpToDate = await super.checkIsUpToDate();
		if (!leafIsUpToDate && !this.recheckLeafIsUpToDate) {
			// Delete the done file so that even if we get interrupted, we will rebuild the next time.
			// Unless recheck is enable, which means the task has the ability to determine whether it
			// needs to be rebuilt even the initial check failed
			const doneFileFullPath = this.doneFileFullPath;
			try {
				if (existsSync(doneFileFullPath)) {
					await unlink(doneFileFullPath);
				}
			} catch {
				console.warn(
					`${this.node.pkg.nameColored}: warning: unable to unlink ${doneFileFullPath}`,
				);
			}
		}
		return leafIsUpToDate;
	}

	protected async markExecDone() {
		const doneFileFullPath = this.doneFileFullPath;
		try {
			// TODO: checkLeafIsUpToDate already called this. Consider reusing its results to save recomputation of them.
			const content = await this.getDoneFileContent();
			if (content !== undefined) {
				await writeFile(doneFileFullPath, content);
			} else {
				this._isIncremental = false;
				console.warn(
					`${this.node.pkg.nameColored}: warning: unable to generate content for ${doneFileFullPath}`,
				);
			}
		} catch (error) {
			this._isIncremental = false;
			console.warn(
				`${this.node.pkg.nameColored}: warning: unable to write ${doneFileFullPath}\n error: ${error}`,
			);
		}
	}

	protected async checkLeafIsUpToDate() {
		const doneFileFullPath = this.doneFileFullPath;
		try {
			const doneFileExpectedContent = await this.getDoneFileContent();
			if (doneFileExpectedContent !== undefined) {
				const doneFileContent = await readFile(doneFileFullPath, "utf8");
				if (doneFileContent === doneFileExpectedContent) {
					return true;
				}
				this.traceTrigger(`mismatched compare file: ${doneFileFullPath}`);
				// These log statements can be useful for debugging, but they're extremely long and completely
				// obscure other logs.
				// In the future we can consider logging just the diff between the input and output.
				// this.traceTrigger(doneFileExpectedContent);
				// this.traceTrigger(doneFileContent);
			} else {
				this.traceTrigger(
					"unable to generate done file expected content (getDoneFileContent returned undefined)",
				);
			}
		} catch {
			this.traceTrigger(`unable to read compare file: ${doneFileFullPath}`);
		}
		return false;
	}

	/**
	 * Subclass could override this to provide an alternative done file name
	 */
	protected get doneFile(): string {
		const name = path.parse(this.executable).name.replace(/\s/g, "_");
		// use 8 char of the sha256 hash of the command to distinguish different tasks
		const hash = crypto
			.createHash("sha256")
			.update(this.command)
			.digest("hex")
			.substring(0, 8);
		return `${name}-${hash}.done.build.log`;
	}

	/**
	 * Subclass should override these to configure the leaf with done file task
	 */

	/**
	 * The content to be written in the "done file".
	 * @remarks
	 * This file must have different content if the work needed to be done by this task changes.
	 * This is typically done by listing and/or hashing the inputs and outputs to this task.
	 * This is invoked before the task is run to check if an existing done file from a previous run matches: if so, the task can be skipped.
	 * If not, the task is run, after which this is invoked a second time to produce the contents to write to disk.
	 */
	protected abstract getDoneFileContent(): Promise<string | undefined>;
}

export class UnknownLeafTask extends LeafTask {
	constructor(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName: string | undefined,
	) {
		super(node, command, context, taskName);
	}

	protected get isIncremental() {
		return this.command === "";
	}

	protected async checkLeafIsUpToDate() {
		if (this.command === "") {
			// Empty command is always up to date.
			return true;
		}
		// Because we don't know, it is always out of date and need to rebuild
		this.traceTrigger("Unknown task");
		return false;
	}
}

export abstract class LeafWithFileStatDoneFileTask extends LeafWithDoneFileTask {
	/**
	 * @returns the list of absolute paths to files that this task depends on.
	 */
	protected abstract getInputFiles(): Promise<string[]>;

	/**
	 * @returns the list of absolute paths to files that this task generates.
	 */
	protected abstract getOutputFiles(): Promise<string[]>;

	/**
	 * If this returns true, then the donefile will use the hash of the file contents instead of the last modified time
	 * and other file stats.
	 *
	 * Hashing is roughly 20% slower than the stats-based approach, but is less susceptible to getting invalidated by
	 * other processes like git touching files but not ultimately changing their contents.
	 */
	protected get useHashes(): boolean {
		return false;
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		if (this.useHashes) {
			return this.getHashDoneFileContent();
		}

		// Gather the file information
		try {
			const srcFiles = await this.getInputFiles();
			const dstFiles = await this.getOutputFiles();
			const srcTimesP = Promise.all(
				srcFiles
					.map((match) => this.getPackageFileFullPath(match))
					.map((match) => stat(match)),
			);
			const dstTimesP = Promise.all(
				dstFiles
					.map((match) => this.getPackageFileFullPath(match))
					.map((match) => stat(match)),
			);
			const [srcTimes, dstTimes] = await Promise.all([srcTimesP, dstTimesP]);

			const srcInfo = srcTimes.map((srcTime) => {
				return { mtimeMs: srcTime.mtimeMs, size: srcTime.size };
			});
			const dstInfo = dstTimes.map((dstTime) => {
				return { mtimeMs: dstTime.mtimeMs, size: dstTime.size };
			});
			return JSON.stringify({ srcFiles, dstFiles, srcInfo, dstInfo });
		} catch (e: any) {
			this.traceError(`error comparing file times: ${e.message}`);
			this.traceTrigger("failed to get file stats");
			return undefined;
		}
	}

	private async getHashDoneFileContent(): Promise<string | undefined> {
		const mapHash = async (name: string) => {
			const hash = await this.node.context.fileHashCache.getFileHash(
				this.getPackageFileFullPath(name),
			);
			return { name, hash };
		};

		try {
			const srcFiles = await this.getInputFiles();
			const dstFiles = await this.getOutputFiles();
			const srcHashesP = Promise.all(srcFiles.map(mapHash));
			const dstHashesP = Promise.all(dstFiles.map(mapHash));

			const [srcHashes, dstHashes] = await Promise.all([srcHashesP, dstHashesP]);

			// sort by name for determinism
			srcHashes.sort(sortByName);
			dstHashes.sort(sortByName);

			const output = JSON.stringify({
				srcHashes,
				dstHashes,
			});
			return output;
		} catch (e: any) {
			this.traceError(`error calculating file hashes: ${e.message}`);
			this.traceTrigger("failed to get file hash");
			return undefined;
		}
	}
}

function sortByName(a: { name: string }, b: { name: string }): number {
	if (a.name < b.name) {
		return -1;
	}
	if (a.name > b.name) {
		return 1;
	}
	return 0;
}
