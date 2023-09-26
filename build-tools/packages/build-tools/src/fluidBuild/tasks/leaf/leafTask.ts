/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import { AsyncPriorityQueue } from "async";
import chalk from "chalk";
import crypto from "crypto";
import registerDebug from "debug";
import * as path from "path";

import { defaultLogger } from "../../../common/logging";
import {
	ExecAsyncResult,
	execAsync,
	existsSync,
	getExecutableFromCommand,
	readFileAsync,
	statAsync,
	unlinkAsync,
	writeFileAsync,
} from "../../../common/utils";
import { BuildPackage, BuildResult, summarizeBuildResult } from "../../buildGraph";
import { options } from "../../options";
import { Task, TaskExec } from "../task";

const { log } = defaultLogger;
const traceTaskTrigger = registerDebug("fluid-build:task:trigger");
const traceTaskInitDep = registerDebug("fluid-build:task:init:dep");
const traceTaskInitWeight = registerDebug("fluid-build:task:init:weight");
const traceTaskQueue = registerDebug("fluid-build:task:exec:queue");
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
	constructor(node: BuildPackage, command: string, taskName: string | undefined) {
		super(node, command, taskName);
		if (!this.isDisabled) {
			this.node.buildContext.taskStats.leafTotalCount++;
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
						`Circular dependency: ${e.map((v) => v.nameColored).join("->")}`,
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
		const isLintTask = this.executable === "eslint" || this.executable === "prettier";
		return (options.nolint && isLintTask) || (options.lintonly && !isLintTask);
	}

	public get executable() {
		return getExecutableFromCommand(this.command);
	}

	protected get useWorker() {
		return false;
	}
	public async exec(): Promise<BuildResult> {
		if (this.isDisabled) {
			return BuildResult.UpToDate;
		}
		if (options.showExec) {
			this.node.buildContext.taskStats.leafBuiltCount++;
			const taskNum = this.node.buildContext.taskStats.leafBuiltCount
				.toString()
				.padStart(3, " ");
			const totalTask =
				this.node.buildContext.taskStats.leafTotalCount -
				this.node.buildContext.taskStats.leafUpToDateCount;
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
		const workerPool = this.node.buildContext.workerPool;
		if (workerPool && this.useWorker) {
			const workerResult = await workerPool.runOnWorker(
				this.executable,
				this.command,
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
									cmd: this.command,
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
		if (this.command === "") {
			return { error: null, stdout: "", stderr: "" };
		}
		return execAsync(this.command, {
			cwd: this.node.pkg.directory,
			env: {
				...process.env,
				PATH: `${path.join(this.node.pkg.directory, "node_modules", ".bin")}${
					path.delimiter
				}${process.env["PATH"]}`,
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

			this.node.buildContext.taskStats.leafBuiltCount++;
			const taskNum = this.node.buildContext.taskStats.leafBuiltCount
				.toString()
				.padStart(3, " ");
			const totalTask =
				this.node.buildContext.taskStats.leafTotalCount -
				this.node.buildContext.taskStats.leafUpToDateCount;
			const elapsedTime = (Date.now() - startTime) / 1000;
			const workerMsg = worker ? "[worker] " : "";
			const statusString = `[${taskNum}/${totalTask}] ${statusCharacter} ${
				this.node.pkg.nameColored
			}: ${workerMsg}${this.command} - ${elapsedTime.toFixed(3)}s`;
			log(statusString);
			if (status === BuildResult.Failed) {
				this.node.buildContext.failedTaskLines.push(statusString);
			}
			this.node.buildContext.taskStats.leafExecTimeTotal += elapsedTime;
		}
		return status;
	}

	protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
		this.traceExec("Begin Leaf Task");
		const result = await this.buildDependentTask(q);
		if (result === BuildResult.Failed) {
			return BuildResult.Failed;
		}

		return new Promise((resolve, reject) => {
			traceTaskQueue(`${this.nameColored}: queued with weight ${this.weight}`);
			q.push({ task: this, resolve, queueTime: Date.now() }, -this.weight);
		});
	}

	protected async checkIsUpToDate(): Promise<boolean> {
		if (this.isDisabled) {
			return true;
		}
		if (options.lintonly) {
			return false;
		}

		const leafIsUpToDate =
			(await this.checkDependentLeafTasksIsUpToDate()) && (await this.checkLeafIsUpToDate());
		if (leafIsUpToDate) {
			this.node.buildContext.taskStats.leafUpToDateCount++;
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

	protected getPackageFileFullPath(filePath: string): string {
		return path.join(this.node.pkg.directory, filePath);
	}

	protected get allDependentTasks() {
		return (function* (dependentTasks) {
			const pending: LeafTask[] = [...dependentTasks];
			const seen = new Set<LeafTask>();
			while (true) {
				const leafTask = pending.pop();
				if (!leafTask) {
					return;
				}
				if (seen.has(leafTask)) {
					continue;
				}
				seen.add(leafTask);
				yield leafTask;
				pending.push(...leafTask.getDependentLeafTasks());
			}
		})(this.getDependentLeafTasks());
	}

	/**
	 * Subclass should override these to configure the leaf task
	 */

	// check if this task is up to date
	protected abstract checkLeafIsUpToDate(): Promise<boolean>;

	// do this task support recheck when it time to execute (even when the dependent task is out of date)
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
}

export abstract class LeafWithDoneFileTask extends LeafTask {
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
					await unlinkAsync(doneFileFullPath);
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
			const content = await this.getDoneFileContent();
			if (content !== undefined) {
				await writeFileAsync(doneFileFullPath, content);
			} else {
				console.warn(
					`${this.node.pkg.nameColored}: warning: unable to generate content for ${doneFileFullPath}`,
				);
			}
		} catch (error) {
			console.warn(
				`${this.node.pkg.nameColored}: warning: unable to write ${doneFileFullPath}\n error: ${error}`,
			);
		}
	}

	protected async checkLeafIsUpToDate() {
		const doneFileFullPath = this.doneFileFullPath!;
		try {
			const doneFileExpectedContent = await this.getDoneFileContent();
			if (doneFileExpectedContent) {
				const doneFileContent = await readFileAsync(doneFileFullPath, "utf8");
				if (doneFileContent === doneFileExpectedContent) {
					return true;
				}
				this.traceTrigger("mismatched compare file");
				traceTaskTrigger(doneFileExpectedContent);
				traceTaskTrigger(doneFileContent);
			} else {
				this.traceTrigger("unable to generate done file expected content");
			}
		} catch {
			this.traceTrigger("unable to read compare file");
		}
		return false;
	}

	/**
	 * Subclass could override this to provide an alternative done file name
	 */
	protected get doneFile(): string {
		const name = path.parse(this.executable).name;
		// use 8 char of the sha256 hash of the command to distinguish different tasks
		const hash = crypto.createHash("sha256").update(this.command).digest("hex").substring(0, 8);
		return `${name}-${hash}.done.build.log`;
	}

	/**
	 * Subclass should override these to configure the leaf with done file task
	 */

	// The content to be written in the done file.
	protected abstract getDoneFileContent(): Promise<string | undefined>;
}

export class UnknownLeafTask extends LeafTask {
	protected async checkLeafIsUpToDate() {
		if (this.command === "") {
			// Empty command is always up to date.
			return true;
		}
		// Because we don't know, it is always out of date and need to rebuild
		return false;
	}
}

export abstract class LeafWithFileStatDoneFileTask extends LeafWithDoneFileTask {
	protected abstract getInputFiles(): Promise<string[]>;
	protected abstract getOutputFiles(): Promise<string[]>;

	protected async getDoneFileContent(): Promise<string | undefined> {
		// Gather the file information
		try {
			const srcFiles = await this.getInputFiles();
			const dstFiles = await this.getOutputFiles();
			const srcTimesP = Promise.all(srcFiles.map((match) => statAsync(match)));
			const dstTimesP = Promise.all(dstFiles.map((match) => statAsync(match)));
			const [srcTimes, dstTimes] = await Promise.all([srcTimesP, dstTimesP]);

			const srcInfo = srcTimes.map((srcTime) => {
				return { mtimeMs: srcTime.mtimeMs, size: srcTime.size };
			});
			const dstInfo = dstTimes.map((dstTime) => {
				return { mtimeMs: dstTime.mtimeMs, size: dstTime.size };
			});
			return JSON.stringify({ srcFiles, dstFiles, srcInfo, dstInfo });
		} catch (e: any) {
			this.traceExec(`error comparing file times ${e.message}`);
			this.traceTrigger("failed to get file stats");
			return undefined;
		}
	}
}
