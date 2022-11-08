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
import { ScriptDependencies } from "../../../common/npmPackage";
import {
    ExecAsyncResult,
    execAsync,
    existsSync,
    getExecutableFromCommand,
    readFileAsync,
    unlinkAsync,
    writeFileAsync,
} from "../../../common/utils";
import { BuildPackage, BuildResult, summarizeBuildResult } from "../../buildGraph";
import { options } from "../../options";
import { Task, TaskExec } from "../task";

const { info, verbose } = defaultLogger;
const traceTaskTrigger = registerDebug("fluid-build:task:trigger");
const traceTaskDep = registerDebug("fluid-build:task:dep");
interface TaskExecResult extends ExecAsyncResult {
    worker?: boolean;
}

export abstract class LeafTask extends Task {
    private dependentTasks?: LeafTask[];
    private parentCount: number = 0;

    constructor(node: BuildPackage, command: string, private scriptDeps: ScriptDependencies) {
        super(node, command);
        if (!this.isDisabled) {
            this.node.buildContext.taskStats.leafTotalCount++;
        }
    }

    public get isLeaf(): boolean {
        return true;
    }

    public get isDisabled() {
        const isLintTask = this.executable === "eslint" || this.executable === "tsfmt";
        return (options.nolint && isLintTask) || (options.lintonly && !isLintTask);
    }

    public get executable() {
        return getExecutableFromCommand(this.command);
    }

    public initializeDependentTask() {
        this.dependentTasks = new Array<LeafTask>();
        if (Object.keys(this.scriptDeps).length) {
            for (const depPackage of this.node.dependentPackages) {
                const depScripts = this.scriptDeps[depPackage.pkg.name];
                if (depScripts) {
                    for (const depScript of depScripts) {
                        if (
                            this.addChildTask(
                                this.dependentTasks,
                                depPackage,
                                `npm run ${depScript}`,
                            )
                        ) {
                            this.logVerboseDependency(depPackage, depScript);
                        }
                    }
                }
            }
        }
        this.addDependentTasks(this.dependentTasks);
    }

    public matchTask(command: string, options?: any): LeafTask | undefined {
        return this.command === command ? this : undefined;
    }

    public collectLeafTasks(leafTasks: LeafTask[]) {
        leafTasks.push(this);
        this.parentCount++;
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
            info(`[${taskNum}/${totalTask}] ${this.node.pkg.nameColored}: ${this.command}`);
        }
        const startTime = Date.now();
        if (this.recheckLeafIsUpToDate && !this.forced && (await this.checkLeafIsUpToDate())) {
            return this.execDone(startTime, BuildResult.UpToDate);
        }
        const ret = await this.execCore();

        if (ret.error) {
            const codeStr = ret.error.code !== undefined ? ` (exit code ${ret.error.code})` : "";
            console.error(`${this.node.pkg.nameColored}: error during command '${this.command}'`);
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
        return execAsync(this.command, {
            cwd: this.node.pkg.directory,
            env: {
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
            info(statusString);
            if (status === BuildResult.Failed) {
                this.node.buildContext.failedTaskLines.push(statusString);
            }
            this.node.buildContext.taskStats.leafExecTimeTotal += elapsedTime;
        }
        return status;
    }

    protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        this.logVerboseTask("Begin Leaf Task");
        const result = await this.buildDependentTask(q);
        if (result === BuildResult.Failed) {
            return BuildResult.Failed;
        }

        return new Promise((resolve, reject) => {
            this.logVerboseTask(`[${this.parentCount}] Queue Leaf Task`);
            q.push({ task: this, resolve }, -this.parentCount);
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
            (await this.checkDependentTasksIsUpToDate()) && (await this.checkLeafIsUpToDate());
        if (leafIsUpToDate) {
            this.node.buildContext.taskStats.leafUpToDateCount++;
            this.logVerboseTask(`Skipping Leaf Task`);
        }

        return leafIsUpToDate;
    }

    protected addChildTask(
        dependentTasks: LeafTask[],
        node: BuildPackage,
        command: string,
        options?: any,
    ) {
        const task = node.findTask(command, options);
        if (task) {
            task.collectLeafTasks(dependentTasks);
            return task;
        }
        return undefined;
    }

    private async checkDependentTasksIsUpToDate(): Promise<boolean> {
        const dependentTasks = this.getDependentTasks();
        for (const dependentTask of dependentTasks) {
            if (!(await dependentTask.isUpToDate())) {
                this.logVerboseTrigger(`dependent task ${dependentTask.toString()} not up to date`);
                return false;
            }
        }
        return true;
    }

    private getDependentTasks(): LeafTask[] {
        assert.notStrictEqual(this.dependentTasks, undefined);
        return this.dependentTasks!;
    }

    private async buildDependentTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        const p = new Array<Promise<BuildResult>>();
        for (const dependentTask of this.getDependentTasks()) {
            p.push(dependentTask.run(q));
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
                pending.push(...leafTask.getDependentTasks());
            }
        })(this.getDependentTasks());
    }

    /**
     * Subclass should override these to configure the leaf task
     */

    // collect the dependent task this leaf task has
    protected abstract addDependentTasks(dependentTasks: LeafTask[]): void;

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

    protected logVerboseNotUpToDate() {
        this.logVerboseTrigger("not up to date");
    }

    protected logVerboseTrigger(reason: string) {
        const msg = `Triggering Leaf Task: [${reason}] ${this.node.pkg.nameColored} - ${this.command}`;
        traceTaskTrigger(msg);
        verbose(msg);
    }

    protected logVerboseDependency(child: BuildPackage, dep: string) {
        const msg = `Task Dependency: ${this.node.pkg.nameColored} ${this.executable} -> ${child.pkg.nameColored} ${dep}`;
        traceTaskDep(msg);
        verbose(msg);
    }

    protected logVerboseTask(msg: string) {
        verbose(`Task: ${this.node.pkg.nameColored} ${this.executable}: ${msg}`);
    }

    protected addAllDependentPackageTasks(dependentTasks: LeafTask[]) {
        for (const child of this.node.dependentPackages) {
            if (child.task) {
                child.task.collectLeafTasks(dependentTasks);
                this.logVerboseDependency(child, "*");
            }
        }

        // TODO: we should add all the prefix tasks in the task tree of the current package as well.
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
        } catch {
            console.warn(
                `${this.node.pkg.nameColored}: warning: unable to write ${doneFileFullPath}`,
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
                this.logVerboseTrigger("mismatched compare file");
                traceTaskTrigger(doneFileExpectedContent);
                traceTaskTrigger(doneFileContent);
            } else {
                this.logVerboseTrigger("unable to generate done file expected content");
            }
        } catch {
            this.logVerboseTrigger("unable to read compare file");
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
    protected addDependentTasks(dependentTasks: LeafTask[]) {
        // Because we don't know, we need to depends on all the task in the dependent packages
        this.addAllDependentPackageTasks(dependentTasks);
    }

    protected async checkLeafIsUpToDate() {
        // Because we don't know, it is always out of date and need to rebuild
        return false;
    }
}
