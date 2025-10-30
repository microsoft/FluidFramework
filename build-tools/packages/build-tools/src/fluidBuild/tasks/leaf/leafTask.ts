/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";

import crypto from "crypto";
import * as path from "path";
import type { AsyncPriorityQueue } from "async";
import registerDebug from "debug";
import globby from "globby";
import chalk from "picocolors";

import { defaultLogger } from "../../../common/logging";
import {
	type ExecAsyncResult,
	execAsync,
	getExecutableFromCommand,
} from "../../../common/utils";
import type { BuildContext } from "../../buildContext";
import { type BuildPackage } from "../../buildGraph";
import { BuildResult, summarizeBuildResult } from "../../buildResult";
import { STATUS_SYMBOLS } from "../../buildStatusSymbols";
import {
	type GitIgnoreSetting,
	type GitIgnoreSettingValue,
	gitignoreDefaultValue,
} from "../../fluidBuildConfig";
import { options } from "../../options";
import type { CacheEntry } from "../../sharedCache/types.js";
import { Task, type TaskExec } from "../task";

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

		// Check shared cache before executing
		const { entry: cacheEntry, lookupPerformed: lookupWasPerformed } =
			await this.checkSharedCache();

		if (cacheEntry) {
			// Cache hit! Restore outputs from cache
			const restoreResult = await this.restoreFromCache(cacheEntry);
			if (restoreResult.success) {
				return this.execDone(
					startTime,
					BuildResult.CachedSuccess,
					undefined,
					cacheEntry.manifest.executionTimeMs,
				);
			}
			// Cache restore failed, fall through to normal execution
			// Only warn on unexpected failures (I/O errors, corruption), not expected issues
			if (restoreResult.isUnexpectedFailure) {
				console.warn(
					`${this.node.pkg.nameColored}: warning: cache restore failed unexpectedly: ${restoreResult.error ?? "unknown error"}`,
				);
			}
		}

		if (this.recheckLeafIsUpToDate && !this.forced && (await this.checkLeafIsUpToDate())) {
			return this.execDone(startTime, BuildResult.LocalCacheHit);
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

		// Write to cache after successful execution
		const executionTime = Date.now() - startTime;
		const cacheWriteResult = await this.writeToCache(executionTime, ret, lookupWasPerformed);

		return this.execDone(
			startTime,
			cacheWriteResult.success ? BuildResult.SuccessWithCacheWrite : BuildResult.Success,
			ret.worker,
			undefined,
			cacheWriteResult.reason,
		);
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

	private execDone(
		startTime: number,
		status: BuildResult,
		worker?: boolean,
		originalExecutionTimeMs?: number,
		cacheSkipReason?: string,
	) {
		if (!options.showExec) {
			let statusCharacter: string = " ";
			switch (status) {
				case BuildResult.Success:
					statusCharacter = chalk.yellowBright(STATUS_SYMBOLS.SUCCESS);
					break;
				case BuildResult.UpToDate:
					statusCharacter = chalk.cyanBright(STATUS_SYMBOLS.UP_TO_DATE);
					break;
				case BuildResult.Failed:
					statusCharacter = chalk.redBright(STATUS_SYMBOLS.FAILED);
					break;
				case BuildResult.CachedSuccess:
					statusCharacter = chalk.blueBright(STATUS_SYMBOLS.CACHED_SUCCESS);
					break;
				case BuildResult.SuccessWithCacheWrite:
					statusCharacter = chalk.greenBright(STATUS_SYMBOLS.SUCCESS_WITH_CACHE_WRITE);
					break;
				case BuildResult.LocalCacheHit:
					statusCharacter = chalk.greenBright(STATUS_SYMBOLS.LOCAL_CACHE_HIT);
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
			let timeSavedMsg = "";
			if (status === BuildResult.CachedSuccess && originalExecutionTimeMs !== undefined) {
				const timeSavedSeconds = (originalExecutionTimeMs / 1000 - elapsedTime).toFixed(3);
				timeSavedMsg = ` (saved ${timeSavedSeconds}s)`;
			}
			let cacheSkipMsg = "";
			if (cacheSkipReason) {
				cacheSkipMsg = ` (cache not uploaded: ${cacheSkipReason})`;
			}
			const statusString = `[${taskNum}/${totalTask}] ${statusCharacter} ${
				this.node.pkg.nameColored
			}: ${workerMsg}${this.command} - ${elapsedTime.toFixed(3)}s${timeSavedMsg}${suffix}${cacheSkipMsg}`;
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

	/**
	 * Check if outputs are available in shared cache.
	 *
	 * This method computes the cache key based on task inputs and queries
	 * the shared cache to see if a matching entry exists.
	 *
	 * @returns Object with cache entry (if found) and whether lookup was performed
	 */
	protected async checkSharedCache(): Promise<{
		entry: CacheEntry | undefined;
		lookupPerformed: boolean;
	}> {
		const sharedCache = this.context.sharedCache;
		if (!sharedCache) {
			return { entry: undefined, lookupPerformed: false };
		}

		try {
			// Gather input files for cache key computation
			const inputFiles = await this.getCacheInputFiles();
			if (!inputFiles) {
				// Task doesn't support cache input detection
				return { entry: undefined, lookupPerformed: false };
			}

			// Filter out directories and hash all input files
			const inputHashes = await Promise.all(
				inputFiles.map(async (filePath) => {
					const absolutePath = this.getPackageFileFullPath(filePath);
					try {
						const stats = await stat(absolutePath);
						if (!stats.isFile()) {
							// Skip directories and other non-file entries
							return null;
						}
						const hash = await this.node.context.fileHashCache.getFileHash(absolutePath);
						return { path: filePath, hash };
					} catch (error) {
						// Skip files that can't be accessed (might have been deleted)
						this.traceError(
							`Failed to hash input file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
						);
						return null;
					}
				}),
			).then(
				(results) =>
					results.filter((r) => r !== null) as Array<{ path: string; hash: string }>,
			);

			// Prepare cache key inputs (global components come from SharedCacheManager)
			const cacheKeyInputs = {
				packageName: this.node.pkg.name,
				taskName: this.taskName ?? this.executable,
				executable: this.executable,
				command: this.command,
				inputHashes,
				...sharedCache.getGlobalKeyComponents(),
			};

			// Look up in cache
			const entry = await sharedCache.lookup(cacheKeyInputs);
			return { entry, lookupPerformed: true };
		} catch (error) {
			// Only warn on unexpected errors - the lookup itself logs expected cache misses at debug level
			// We only get here on exceptions during input file hashing or other unexpected issues
			console.warn(
				`${this.node.pkg.nameColored}: warning: cache lookup failed due to unexpected error: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { entry: undefined, lookupPerformed: false };
		}
	}

	/**
	 * Restore outputs from a cache entry to the workspace.
	 *
	 * This copies cached output files to their expected locations and
	 * updates task state to reflect the cache hit.
	 *
	 * @param cacheEntry - The cache entry to restore from
	 * @returns Restore result with success status and statistics
	 */
	protected async restoreFromCache(cacheEntry: {
		cacheKey: string;
		entryPath: string;
		manifest: any;
	}) {
		const sharedCache = this.context.sharedCache;
		if (!sharedCache) {
			return {
				success: false,
				filesRestored: 0,
				bytesRestored: 0,
				restoreTimeMs: 0,
				isUnexpectedFailure: false,
			};
		}

		try {
			// Get output file paths
			const outputFiles = await this.getCacheOutputFiles();
			if (!outputFiles) {
				return {
					success: false,
					filesRestored: 0,
					bytesRestored: 0,
					restoreTimeMs: 0,
					isUnexpectedFailure: false,
				};
			}

			// Restore files from cache
			const result = await sharedCache.restore(cacheEntry, this.node.pkg.directory);

			// Write done file if this task uses one (handled by markCacheRestoreDone)
			if (result.success) {
				await this.markCacheRestoreDone();
			}

			return result;
		} catch (error) {
			// This is an unexpected error during restore setup/completion
			console.warn(
				`${this.node.pkg.nameColored}: warning: cache restore failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
			);
			return {
				success: false,
				filesRestored: 0,
				bytesRestored: 0,
				restoreTimeMs: 0,
				isUnexpectedFailure: true,
			};
		}
	}

	/**
	 * Write task outputs to shared cache after successful execution.
	 *
	 * This captures output files and stores them in the cache for future reuse.
	 *
	 * @param executionTimeMs - Time taken to execute the task in milliseconds
	 * @param execResult - Result from task execution (for stdout/stderr)
	 * @param lookupWasPerformed - Whether a cache lookup was performed before execution
	 */
	protected async writeToCache(
		executionTimeMs: number,
		execResult?: TaskExecResult,
		lookupWasPerformed: boolean = true,
	): Promise<{ success: boolean; reason?: string }> {
		const sharedCache = this.context.sharedCache;
		if (!sharedCache) {
			// No warning - this is expected when cache is not configured
			return { success: false };
		}

		try {
			// Gather input files for cache key computation
			const inputFiles = await this.getCacheInputFiles();
			if (!inputFiles) {
				this.traceError("Cache write skipped: unable to determine input files");
				return { success: false, reason: "unable to determine input files" };
			}

			// Get output files
			const outputFiles = await this.getCacheOutputFiles();
			if (!outputFiles) {
				this.traceError("Cache write skipped: unable to determine output files");
				return { success: false, reason: "unable to determine output files" };
			}

			// Always include the donefile as an output (if this task has one)
			// This enables sharing build/lint status across workspaces
			const doneFile = (this as any).doneFile as string | undefined;
			if (doneFile && !outputFiles.includes(doneFile)) {
				outputFiles.push(doneFile);
			}

			// Filter out directories and hash all input files
			const inputHashes = await Promise.all(
				inputFiles.map(async (filePath) => {
					const absolutePath = this.getPackageFileFullPath(filePath);
					try {
						const stats = await stat(absolutePath);
						if (!stats.isFile()) {
							// Skip directories and other non-file entries
							return null;
						}
						const hash = await this.node.context.fileHashCache.getFileHash(absolutePath);
						return { path: filePath, hash };
					} catch (error) {
						// Skip files that can't be accessed (might have been deleted)
						this.traceError(
							`Failed to hash input file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
						);
						return null;
					}
				}),
			).then(
				(results) =>
					results.filter((r) => r !== null) as Array<{ path: string; hash: string }>,
			);

			// Prepare cache key inputs (global components come from SharedCacheManager)
			const cacheKeyInputs = {
				packageName: this.node.pkg.name,
				taskName: this.taskName ?? this.executable,
				executable: this.executable,
				command: this.command,
				inputHashes,
				...sharedCache.getGlobalKeyComponents(),
			};

			// Prepare task outputs - filter out files that don't exist
			const existingOutputFiles = outputFiles.filter((relativePath) => {
				const fullPath = this.getPackageFileFullPath(relativePath);
				return existsSync(fullPath);
			});

			// Check if any outputs were produced
			if (existingOutputFiles.length === 0) {
				const reason = "no output files found";
				console.warn(
					`${this.node.pkg.nameColored}: cache write skipped - ${reason} (expected ${outputFiles.length} files)`,
				);
				return { success: false, reason };
			}

			const taskOutputs = {
				files: existingOutputFiles.map((relativePath) => ({
					sourcePath: this.getPackageFileFullPath(relativePath),
					relativePath,
				})),
				stdout: execResult?.stdout ?? "",
				stderr: execResult?.stderr ?? "",
				exitCode: execResult?.error ? (execResult.error.code ?? 1) : 0,
				executionTimeMs,
			};

			// Store in cache
			const storeResult = await sharedCache.store(
				cacheKeyInputs,
				taskOutputs,
				this.node.pkg.directory,
				lookupWasPerformed,
			);
			return storeResult;
		} catch (error) {
			// Only warn on unexpected errors during cache write preparation
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(
				`${this.node.pkg.nameColored}: cache write failed due to unexpected error: ${reason}`,
			);
			return { success: false, reason };
		}
	}

	/**
	 * Get the list of input files for cache key computation.
	 *
	 * Subclasses should override this to provide their specific input files.
	 * Return undefined if the task doesn't support cache input detection.
	 *
	 * @returns Array of relative paths to input files, or undefined
	 */
	protected async getCacheInputFiles(): Promise<string[] | undefined> {
		return undefined;
	}

	/**
	 * Get the list of output files to cache.
	 *
	 * Subclasses should override this to provide their specific output files.
	 * Return undefined if the task doesn't support cache output detection.
	 *
	 * @returns Array of relative paths to output files, or undefined
	 */
	protected async getCacheOutputFiles(): Promise<string[] | undefined> {
		return undefined;
	}

	/**
	 * Mark task as done after cache restore.
	 *
	 * This is a hook for tasks to update their state after cache restoration.
	 * Default implementation does nothing. Subclasses can override.
	 */
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	protected async markCacheRestoreDone(): Promise<void> {}
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
	 * Mark task as done after cache restore.
	 *
	 * For done file tasks, we write the done file after cache restoration.
	 */
	protected override async markCacheRestoreDone(): Promise<void> {
		await this.markExecDone();
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

/**
 * A Leaf task base that can be used for tasks that have a list of input and output file paths to include in the
 * donefile. By default, the donefile will contain the filestat information, like last modified time, as the values in
 * the donefile. Despite its name, this class can be used for hash-based donefiles by overriding the `useHashes`
 * property.
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

	protected override async getCacheInputFiles(): Promise<string[] | undefined> {
		try {
			const inputFiles = await this.getInputFiles();
			const pkgDir = this.node.pkg.directory;
			return inputFiles.map((f) => {
				return path.isAbsolute(f) ? path.relative(pkgDir, f) : f;
			});
		} catch (e: any) {
			this.traceError(`error getting cache input files: ${e.message}`);
			return undefined;
		}
	}

	protected override async getCacheOutputFiles(): Promise<string[] | undefined> {
		try {
			const outputFiles = await this.getOutputFiles();
			const pkgDir = this.node.pkg.directory;
			return outputFiles.map((f) => {
				return path.isAbsolute(f) ? path.relative(pkgDir, f) : f;
			});
		} catch (e: any) {
			this.traceError(`error getting cache output files: ${e.message}`);
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

		const files = await globby(globs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			gitignore: excludeGitIgnoredFiles,
			// Only return files, not directories
			onlyFiles: true,
		});
		return files;
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
