/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncPriorityQueue } from "async";
import * as assert from "assert";
import * as path from "path";
import { BuildResult, BuildPackage, summarizeBuildResult } from "../../buildGraph";
import { logStatus, logVerbose } from "../../common/logging";
import { options } from "../../options";
import { Task, TaskExec } from "../task";
import { getExecutableFromCommand, writeFileAsync, unlinkAsync, readFileAsync, execAsync, existsSync } from "../../common/utils";
import * as chalk from "chalk";
export abstract class LeafTask extends Task {

    private dependentTasks?: LeafTask[];
    private parentCount: number = 0;

    constructor(node: BuildPackage, command: string) {
        super(node, command);
        if (!this.isDisabled) {
            this.node.buildContext.taskStats.leafTotalCount++;
        }
    }

    public get isLeaf(): boolean { return true; }

    public get isDisabled() {
        return (options.nolint && this.executable === "tslint")
            || (options.lintonly && this.executable !== "tslint");
    }

    public get executable() {
        return getExecutableFromCommand(this.command);
    }

    public initializeDependentTask() {
        this.dependentTasks = new Array<LeafTask>();
        this.addDependentTasks(this.dependentTasks);
    }

    public matchTask(command: string): LeafTask | undefined {
        return (this.command === command) ? this : undefined;
    }

    public collectLeafTasks(leafTasks: LeafTask[]) {
        leafTasks.push(this);
        this.parentCount++;
    }

    public async exec(): Promise<BuildResult> {
        if (this.isDisabled) { return BuildResult.UpToDate; }
        if (options.showExec) {
            this.node.buildContext.taskStats.leafBuiltCount++;
            const taskNum = this.node.buildContext.taskStats.leafBuiltCount.toString().padStart(3, " ");
            const totalTask = this.node.buildContext.taskStats.leafTotalCount - this.node.buildContext.taskStats.leafUpToDateCount;
            logStatus(`[${taskNum}/${totalTask}] ${this.node.pkg.nameColored}: ${this.command}`);
        }
        const startTime = Date.now();
        if (this.recheckLeafIsUpToDate && await this.checkLeafIsUpToDate()) {
            return this.execDone(startTime, BuildResult.UpToDate);
        }
        const ret = await execAsync(this.command, {
            cwd: this.node.pkg.directory,
            env: { path: process.env["PATH"] + ";" + path.join(this.node.pkg.directory, "node_modules", ".bin") }
        });

        if (ret.error) {
            console.log(`${this.node.pkg.nameColored}: error during command ${this.command}`)
            console.log(`${this.node.pkg.nameColored}: ${ret.stdout}\n${ret.stderr}`);
            return this.execDone(startTime, BuildResult.Failed);
        }

        await this.markExecDone();
        return this.execDone(startTime, BuildResult.Success);
    }

    private execDone(startTime: number, status: BuildResult) {
        if (!options.showExec) {
            let statusCharacter: string = " ";
            switch (status) {
                case BuildResult.Success:
                    statusCharacter = chalk.default.greenBright("\u2713");
                    break;
                case BuildResult.UpToDate:
                    statusCharacter = chalk.default.yellowBright("-");
                    break;
                case BuildResult.Failed:
                    statusCharacter = chalk.default.redBright("x");
                    break;
            }

            this.node.buildContext.taskStats.leafBuiltCount++;
            const taskNum = this.node.buildContext.taskStats.leafBuiltCount.toString().padStart(3, " ");
            const totalTask = this.node.buildContext.taskStats.leafTotalCount - this.node.buildContext.taskStats.leafUpToDateCount;
            const elapsedTime = (Date.now() - startTime) / 1000;
            logStatus(`[${taskNum}/${totalTask}] ${statusCharacter} ${this.node.pkg.nameColored}: ${this.command} - ${elapsedTime.toFixed(3)}s`);
            this.node.buildContext.taskStats.leafExecTimeTotal += elapsedTime;
        }
        return status;
    }

    protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        logVerbose(`Begin Leaf Task: ${this.node.pkg.nameColored} - ${this.command}`);
        const result = await this.buildDependentTask(q);
        if (result === BuildResult.Failed) {
            return BuildResult.Failed;
        }

        return new Promise((resolve, reject) => {
            logVerbose(`Queue Leaf Task: ${this.node.pkg.nameColored} - [${this.parentCount}] ${this.command}`);
            q.push({ task: this, resolve }, -this.parentCount);
        });
    }

    protected async checkIsUpToDate(): Promise<boolean> {
        if (this.isDisabled) { return true; }
        if (options.lintonly) { return false; }

        const leafIsUpToDate = await this.checkDependentTasksIsUpToDate() && await this.checkLeafIsUpToDate();
        if (leafIsUpToDate) {
            this.node.buildContext.taskStats.leafUpToDateCount++;
            logVerbose(`Skipping Leaf Task: ${this.node.pkg.nameColored} - ${this.command}`);
        }

        return leafIsUpToDate;
    }

    protected addChildTask(dependentTasks: LeafTask[], node: BuildPackage, command: string) {
        const task = node.findTask(command);
        if (task) {
            task.collectLeafTasks(dependentTasks);
            return task;
        }
        return undefined;
    }

    private async checkDependentTasksIsUpToDate(): Promise<boolean> {
        const dependentTasks = this.getDependentTasks();
        for (const dependentTask of dependentTasks) {
            if (!await dependentTask.isUpToDate()) {
                this.logVerboseTrigger(`dependent task ${dependentTask.toString()} not up to date`);
                return false;
            }
        }
        return true;
    }

    private getDependentTasks(): Task[] {
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

    /**
     * Subclass should override these to configure the leaf task
     */

    // collect the dependent task this leaf task has
    protected abstract addDependentTasks(dependentTasks: LeafTask[]): void;

    // check if this task is up to date
    protected abstract async checkLeafIsUpToDate(): Promise<boolean>;

    // do this task support recheck when it time to execute (even when the dependent task is out of date)
    protected get recheckLeafIsUpToDate(): boolean { return false; }

    // For called when the task has successfully executed
    protected async markExecDone(): Promise<void> { }

    protected logVerboseNotUpToDate() {
        this.logVerboseTrigger("not up to date");
    }

    protected logVerboseTrigger(reason: string) {
        logVerbose(`Triggering Leaf Task: [${reason}] ${this.node.pkg.nameColored} - ${this.command}`);
    }

    protected logVerboseDependency(child: BuildPackage, dep: string) {
        logVerbose(`Task Dependency: ${this.node.pkg.nameColored} ${this.executable} -> ${child.pkg.nameColored} ${dep}`);
    }
};

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
                console.log(`${this.node.pkg.nameColored}: warning: unable to unlink ${doneFileFullPath}`);
            }
        }
        return leafIsUpToDate;
    }

    protected async markExecDone() {
        const doneFileFullPath = this.doneFileFullPath;
        try {
            let content = await this.getDoneFileContent();
            if (content !== undefined) {
                await writeFileAsync(doneFileFullPath, content);
            } else {
                console.log(`${this.node.pkg.nameColored}: warning: unable to generate content for ${doneFileFullPath}`);
            }
        } catch {
            console.log(`${this.node.pkg.nameColored}: warning: unable to write ${doneFileFullPath}`);
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
            } else {
                this.logVerboseTrigger("unable to generate done file expected content");
            }
        } catch {
            this.logVerboseTrigger("unable to read compare file");
        }
        return false;
    }

    /**
     * Subclass should override these to configure the leaf with done file task
     */
    // A done file to be written at the end of the task
    protected abstract get doneFile(): string;

    // The content to be written in the done file.
    protected async getDoneFileContent(): Promise<string | undefined> { return ""; }
}


export class UnknownLeafTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {
        // Because we don't know, we need to depends on all the task in the dependent packages  
        for (const child of this.node.dependentPackages) {
            if (child.task) {
                child.task.collectLeafTasks(dependentTasks);
                this.logVerboseDependency(child, "*");
            }
        }
    }

    protected async checkLeafIsUpToDate() {
        // Because we don't know, it is always out of date and need to rebuild
        return false;
    }
}
