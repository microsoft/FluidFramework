/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncPriorityQueue } from "async";
import * as path from "path";
import { logStatus, logVerbose } from "./common/logging";
import { Package } from "./npmPackage";
import { Task, TaskExec } from "./tasks/task";
import { TaskFactory } from "./tasks/taskFactory";
import { Timer } from './common/timer';
import { getExecutableFromCommand, execAsync, unlinkAsync, rmdirAsync, symlinkAsync } from "./common/utils";
import { FileHashCache } from "./common/fileHashCache";
import { existsSync, lstatAsync, realpathAsync } from "./common/utils";
import chalk from "chalk";

export enum BuildResult {
    Success,
    UpToDate,
    Failed,
};

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
};

class BuildContext {
    public readonly fileHashCache = new FileHashCache();
    public readonly taskStats = new TaskStats();
};

export class BuildPackage {
    private buildTask?: Task;
    private buildScript: string | undefined | null;
    public readonly parents = new Array<BuildPackage>();
    public readonly dependentPackages = new Array<BuildPackage>();
    public level: number = -1;
    private buildP?: Promise<BuildResult>;

    constructor(public readonly buildContext: BuildContext, public readonly pkg: Package, private buildScriptName: string) {
        this.buildScript = null;
    }

    public get task(): Task | undefined {
        if (this.buildScript === null) {
            this.buildScript = this.pkg.getScript(this.buildScriptName);
            if (this.buildScript) {
                this.buildTask = TaskFactory.Create(this, `npm run ${this.buildScriptName}`);
            }
        }
        return this.buildTask;
    }

    public findTask(command: string): Task | undefined {
        const task = this.task;
        if (!task) { return undefined; }
        return task.matchTask(command);
    }

    public async isUpToDate(): Promise<boolean> {
        const task = this.task;
        return task ? task.isUpToDate() : true;
    }

    public async build(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        if (!this.buildP) {
            const task = this.task;
            if (task) {
                this.buildP = task.run(q);
            } else {
                this.buildP = Promise.resolve(BuildResult.UpToDate);
            }
        }
        return this.buildP;
    }

    public async symlink(buildPackages: Map<string, BuildPackage>) {
        for (const dep of this.pkg.dependencies) {
            const depBuildPackage = buildPackages.get(dep);
            if (depBuildPackage) {
                const symlinkPath = path.join(this.pkg.directory, "node_modules", dep);
                try {
                    if (existsSync(symlinkPath)) {
                        const stat = await lstatAsync(symlinkPath);
                        if (!stat.isSymbolicLink || await realpathAsync(symlinkPath) !== depBuildPackage.pkg.directory) {
                            if (stat.isDirectory) {
                                await rmdirAsync(symlinkPath);
                            } else {
                                await unlinkAsync(symlinkPath);
                            }
                            await symlinkAsync(depBuildPackage.pkg.directory, symlinkPath, "junction");
                            console.warn(`WARNING: replaced existing package ${symlinkPath}`);
                        }
                    } else {
                        await symlinkAsync(depBuildPackage.pkg.directory, symlinkPath, "junction");
                    }
                } catch (e) {
                    throw new Error(`symlink failed on ${symlinkPath}. ${e}`);
                }
            }
        }
    }
}

export class BuildGraph {
    private readonly buildPackages = new Map<string, BuildPackage>();
    private readonly buildContext = new BuildContext();

    public constructor(
        private readonly packages: Package[],
        private readonly buildScriptName: string) {

        packages.forEach((value) =>
            this.buildPackages.set(value.name, new BuildPackage(this.buildContext, value, buildScriptName))
        );

        const needPropagate = this.buildDependencies();
        this.populateLevel();
        this.propagateMarkForBuild(needPropagate);
        this.filterPackagesAndInitializeTasks();
    }

    private async isUpToDate() {
        const isUpToDateP = new Array<Promise<boolean>>();
        this.buildPackages.forEach((node) => {
            isUpToDateP.push(node.isUpToDate());
        });
        const isUpToDateArr = await Promise.all(isUpToDateP);
        return isUpToDateArr.every((isUpToDate) => isUpToDate);
    }

    public async build(timer?: Timer): Promise<BuildResult> {
        // TODO: This function can only be called once
        const isUpToDate = await this.isUpToDate();
        if (timer) timer.time(`Check up to date completed`);

        logStatus(`Starting npm script "${chalk.cyanBright(this.buildScriptName)}" for ${this.buildPackages.size} packages`);
        if (this.numSkippedTasks) {
            logStatus(`Skipping ${this.numSkippedTasks} up to date tasks.`);
        }
        if (isUpToDate) {
            return BuildResult.UpToDate;
        }
        this.buildContext.fileHashCache.clear();
        const q = Task.createTaskQueue();
        const p = new Array<Promise<BuildResult>>();
        this.buildPackages.forEach((node) => {
            p.push(node.build(q));
        });
        return summarizeBuildResult(await Promise.all(p));
    }

    public async symlink(): Promise<void> {
        for (const value of this.buildPackages.values()) {
            await value.symlink(this.buildPackages);
        }
    }

    public async clean() {
        const cleanP = new Array<Promise<void>>();
        let numDone = 0;
        let numTotal = 0;
        const execCleanScript = async (pkg: Package, cleanScript: string) => {
            const startTime = Date.now();
            const ret = await execAsync(cleanScript, {
                cwd: pkg.directory,
                env: { path: process.env["PATH"] + ";" + path.join(pkg.directory, "node_modules", ".bin") }
            });
            if (ret.error) {
                console.log(`${pkg.nameColored}: error during command ${cleanScript}`)
                console.log(`${pkg.nameColored}: ${ret.stdout}\n${ret.stderr}`);
            }
            const elapsedTime = (Date.now() - startTime) / 1000;
            logStatus(`[${++numDone}/${numTotal}] ${pkg.nameColored}: ${cleanScript} - ${elapsedTime.toFixed(3)}s`);
        };
        this.buildPackages.forEach((node) => {
            const cleanScript = node.pkg.getScript("clean");
            if (cleanScript) {
                numTotal++;
                cleanP.push(execCleanScript(node.pkg, cleanScript));
            } else {
                const buildScript = node.pkg.getScript("build");
                if (buildScript && getExecutableFromCommand(buildScript) !== "echo") {
                    console.log(`${node.pkg.nameColored}: warning: package has "build" script without "clean" script`);
                }
            }
        });
        return Promise.all(cleanP);
    }

    public get numSkippedTasks(): number {
        return this.buildContext.taskStats.leafUpToDateCount;
    }

    public get totalElapsedTime(): number {
        return this.buildContext.taskStats.leafExecTimeTotal;
    }

    private buildDependencies() {
        const needPropagate: BuildPackage[] = [];
        this.buildPackages.forEach((node) => {
            if (node.pkg.markForBuild) { needPropagate.push(node); }
            for (const key of node.pkg.dependencies) {
                const child = this.buildPackages.get(key);
                if (child) {
                    logVerbose(`Package dependency: ${node.pkg.nameColored} => ${child.pkg.nameColored}`);
                    node.dependentPackages.push(child);
                    child.parents.push(node);
                }
            }
        });

        return needPropagate;
    }

    private populateLevel() {
        // level is not strictly necessary, except for circular reference.
        const getLevel = (node: BuildPackage) => {
            if (node.level === -2) { throw new Error("Circular Reference detected"); }
            if (node.level !== -1) { return node.level; } // populated
            node.level = -2;
            let maxChildrenLevel = -1;
            node.dependentPackages.forEach((child) => {
                maxChildrenLevel = Math.max(maxChildrenLevel, getLevel(child));
            });
            node.level = maxChildrenLevel + 1;
            return maxChildrenLevel + 1;
        }

        this.buildPackages.forEach((node) => {
            getLevel(node);
        });
    }

    private propagateMarkForBuild(needPropagate: BuildPackage[]) {
        while (true) {
            const node = needPropagate.pop();
            if (!node) {
                break;
            }
            node.dependentPackages.forEach((child) => {
                if (!child.pkg.markForBuild) {
                    child.pkg.markForBuild = true;
                    needPropagate.push(child);
                }
            });
        }
    }

    private filterPackagesAndInitializeTasks() {
        let hasTask = false;
        this.buildPackages.forEach((node, name) => {
            if (!node.pkg.markForBuild) {
                this.buildPackages.delete(name);
                return;
            }
            if (node.task) {
                hasTask = true;
                node.task.initializeDependentTask();
            }
        });

        if (!hasTask) {
            throw new Error(`No task for script ${this.buildScriptName} found`);
        }
    }
}