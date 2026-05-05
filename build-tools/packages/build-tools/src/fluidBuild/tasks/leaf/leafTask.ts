/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { AsyncPriorityQueue } from "async";
import crypto from "crypto";
import registerDebug from "debug";
import * as path from "path";
import chalk from "picocolors";

import { defaultLogger } from "../../../common/logging";
import {
	type ExecAsyncResult,
	execAsync,
	getExecutableFromCommand,
} from "../../../common/utils";
import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import { BuildResult, summarizeBuildResult } from "../../buildResult";
import {
	type GitIgnoreSettingValue,
	gitignoreDefaultValue,
	replaceRepoRootToken,
} from "../../fluidBuildConfig";
import type { GitIgnoreSetting } from "../../fluidTaskDefinitions";
import { options } from "../../options";
import { Task, type TaskExec } from "../task";
import { globWithGitignore } from "../taskUtils";

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
	protected get executionCommand(): string {
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

	public initializeDependentLeafTasks(): void {
		this.ensureDependentLeafTasks();
	}

	private ensureDependentLeafTasks(): Set<LeafTask> {
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

	public collectLeafTasks(leafTasks: Set<LeafTask>): void {
		leafTasks.add(this);
	}

	public initializeWeight(): number {
		if (this.parentWeight === -1) {
			this.parentWeight = this.computeParentWeight() + this.taskWeight;
			traceTaskInitWeight(`${this.nameColored}: ${this.parentWeight}`);
		}
		return this.parentWeight;
	}

	private computeParentWeight(): number {
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

	protected get taskWeight(): number {
		return 1;
	}

	public get weight(): number {
		assert.notStrictEqual(this.parentWeight, -1);
		return this.parentWeight;
	}

	public get isDisabled(): boolean {
		if (this.isTemp) {
			return true;
		}
		const isLintTask = this.executable === "eslint" || this.executable === "prettier";
		return (options.nolint && isLintTask) || (options.lintonly && !isLintTask);
	}

	public get executable(): string {
		return getExecutableFromCommand(
			this.command,
			this.context.fluidBuildConfig?.multiCommandExecutables ?? [],
		);
	}

	protected get useWorker(): boolean {
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

	private getExecErrors(ret: ExecAsyncResult): string {
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

	private execDone(startTime: number, status: BuildResult, worker?: boolean): BuildResult {
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

	protected getDependentLeafTasks(): IterableIterator<LeafTask> {
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
	protected abstract get isIncremental(): boolean;

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

	// Called when the task has successfully executed
	protected async markExecDone(): Promise<void> {}

	protected getVsCodeErrorMessages(errorMessages: string): string {
		return errorMessages;
	}

	protected traceNotUpToDate(): void {
		this.traceTrigger("not up to date");
	}

	protected traceTrigger(reason: string): void {
		const msg = `${this.nameColored}: [${reason}]`;
		traceTaskTrigger(msg);
	}

	protected traceError(msg: string): void {
		traceError(`${this.nameColored}: ${msg}`);
	}
}

/**
 * A LeafTask with a "done file" which represents the work this task needs to do.
 */
export abstract class LeafWithDoneFileTask extends LeafTask {
	private _isIncremental: boolean = true;

	protected get isIncremental(): boolean {
		return this._isIncremental;
	}
	protected get doneFileFullPath(): string {
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

	protected async markExecDone(): Promise<void> {
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

	protected async checkLeafIsUpToDate(): Promise<boolean> {
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
	 * Get additional config files to track for this task from the task definition.
	 * @returns absolute paths to additional config files
	 */
	protected get additionalConfigFiles(): string[] {
		if (this.taskName === undefined) {
			return [];
		}

		const repoRoot = this.node.context.repoRoot;
		return this.node
			.getAdditionalConfigFiles(this.taskName)
			.map((configPath) =>
				this.getPackageFileFullPath(replaceRepoRootToken(configPath, repoRoot)),
			);
	}

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

	protected get isIncremental(): boolean {
		return this.command === "";
	}

	protected async checkLeafIsUpToDate(): Promise<boolean> {
		if (this.command === "") {
			// Empty command is always up to date.
			return true;
		}
		// Because we don't know, it is always out of date and need to rebuild
		this.traceTrigger("Unknown task");
		return false;
	}
}

/**
 * A Leaf task base that can be used for tasks that have a list of input and output file paths to include in the
 * donefile.
 *
 * @remarks
 * Despite its name, this class supports both timestamp-based and hash-based donefiles via the `useHashes` property.
 *
 * Subclasses can override `useHashes` to return `true` to use content hashes instead of timestamps. Hashing avoids
 * false positives from timestamp changes that don't reflect actual content changes (e.g., git operations, file
 * copies), but has a small performance cost.
 */
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
	 * @remarks
	 * Hashing avoids false positives from timestamp changes that don't reflect actual content changes (e.g., git
	 * operations, file copies), but has a small performance cost.
	 *
	 * @returns `true` to use content hashes, `false` to use file timestamps (default).
	 */
	protected get useHashes(): boolean {
		return false;
	}

	/**
	 * Get all input files for done file tracking, including additional config files.
	 */
	private async getAllInputFiles(): Promise<string[]> {
		const srcFiles = await this.getInputFiles();
		const additionalConfigFiles = this.additionalConfigFiles;
		if (additionalConfigFiles.length === 0) {
			return srcFiles;
		}
		return [...srcFiles, ...additionalConfigFiles];
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		if (this.useHashes) {
			return this.getHashDoneFileContent();
		}

		// Timestamp-based done file content.
		// Note: timestamps may signal change without meaningful content modification (e.g., git
		// operations, file copies). Override useHashes to return true to use content hashes instead.
		try {
			const allSrcFiles = await this.getAllInputFiles();
			const dstFiles = await this.getOutputFiles();
			const srcTimesP = Promise.all(
				allSrcFiles
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
			return JSON.stringify({ srcFiles: allSrcFiles, dstFiles, srcInfo, dstInfo });
		} catch (e: any) {
			this.traceError(`error comparing file times: ${e.message}`);
			this.traceTrigger("failed to get file stats");
			return undefined;
		}
	}

	private async getHashDoneFileContent(): Promise<string | undefined> {
		const mapHash = async (name: string): Promise<{ name: string; hash: string }> => {
			const hash = await this.node.context.fileHashCache.getFileHash(
				this.getPackageFileFullPath(name),
			);
			return { name, hash };
		};

		try {
			const allSrcFiles = await this.getAllInputFiles();
			const dstFiles = await this.getOutputFiles();
			const srcHashesP = Promise.all(allSrcFiles.map(mapHash));
			const dstHashesP = Promise.all(dstFiles.map(mapHash));

			const [srcHashes, dstHashes] = await Promise.all([srcHashesP, dstHashesP]);

			// sort by name for determinism
			srcHashes.sort(sortByName);
			dstHashes.sort(sortByName);

			return JSON.stringify({
				srcHashes,
				dstHashes,
			});
		} catch (e: any) {
			this.traceError(`error calculating file hashes: ${e.message}`);
			this.traceTrigger("failed to get file hash");
			return undefined;
		}
	}
}

/**
 * A Leaf task that uses a list of globs to determine the input and output files for a donefile. For tasks that have a
 * list of files as input/output, use the {@link LeafWithFileStatDoneFileTask} instead.
 */
export abstract class LeafWithGlobInputOutputDoneFileTask extends LeafWithFileStatDoneFileTask {
	/**
	 * @returns The list of globs for all the files that this task depends on.
	 */
	protected abstract getInputGlobs(): Promise<readonly string[]>;

	/**
	 * @returns The list of globs for all the files that this task generates.
	 */
	protected abstract getOutputGlobs(): Promise<readonly string[]>;

	/**
	 * @returns If the lock file should be included as input files for this task.
	 */
	protected get includeLockFiles(): boolean {
		// Include the lock file by default.
		return true;
	}

	/**
	 * Configures how gitignore rules are applied. "input" applies gitignore rules to the input, "output" applies them to
	 * the output, and including both values will apply the gitignore rules to both the input and output globs.
	 *
	 * The default value, `["input"]` applies gitignore rules to the input, but not the output. This is the right behavior
	 * for many tasks since most tasks use source-controlled files as input but generate gitignored build output. However,
	 * it can be adjusted on a per-task basis depending on the needs of the task.
	 *
	 * @defaultValue `["input"]`
	 */
	protected get gitIgnore(): GitIgnoreSetting {
		return gitignoreDefaultValue;
	}

	protected override async getInputFiles(): Promise<string[]> {
		const inputs = await this.getFiles("input");
		if (this.includeLockFiles) {
			const lockFilePath = this.node.pkg.getLockFilePath();
			if (lockFilePath === undefined) {
				throw new Error(`Lock file missing for ${this.node.pkg.nameColored}.`);
			}
			inputs.push(lockFilePath);
		}
		return inputs;
	}

	protected override async getOutputFiles(): Promise<string[]> {
		return this.getFiles("output");
	}

	/**
	 * Gets all the input or output files for the task based on the globs configured for that task.
	 *
	 * @param mode - Whether to use the input or output globs.
	 * @returns An array of absolute paths to all files that match the globs.
	 */
	private async getFiles(mode: GitIgnoreSettingValue): Promise<string[]> {
		const globs = mode === "input" ? await this.getInputGlobs() : await this.getOutputGlobs();
		const excludeGitIgnoredFiles: boolean = this.gitIgnore.includes(mode);

		return globWithGitignore(globs, {
			cwd: this.node.pkg.directory,
			gitignore: excludeGitIgnoredFiles,
		});
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
