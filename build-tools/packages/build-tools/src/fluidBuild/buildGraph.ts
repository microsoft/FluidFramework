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

const { info, verbose } = defaultLogger;

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
}

class BuildContext {
    public readonly fileHashCache = new FileHashCache();
    public readonly taskStats = new TaskStats();
    public readonly failedTaskLines: string[] = [];
    constructor(public readonly workerPool?: WorkerPool) {}
}

export class BuildPackage {
    private buildTask?: Task | null = null;
    private buildScriptNames: string[];
    public readonly parents = new Array<BuildPackage>();
    public readonly dependentPackages = new Array<BuildPackage>();
    public level: number = -1;
    private buildP?: Promise<BuildResult>;

    constructor(
        public readonly buildContext: BuildContext,
        public readonly pkg: Package,
        buildScriptNames: string[],
    ) {
        this.buildScriptNames = buildScriptNames.filter((name) => this.pkg.getScript(name));
    }

    public get task(): Task | undefined {
        if (this.buildTask === null) {
            this.buildTask = TaskFactory.CreateScriptTasks(this, this.buildScriptNames);
        }
        return this.buildTask;
    }

    public findTask(command: string, options?: any): Task | undefined {
        const task = this.task;
        if (!task) {
            return undefined;
        }
        return task.matchTask(command, options);
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
}

export class BuildGraph {
    public readonly buildPackages = new Map<string, BuildPackage>();
    private readonly buildContext = new BuildContext(
        options.worker
            ? new WorkerPool(options.workerThreads, options.workerMemoryLimit)
            : undefined,
    );

    public constructor(
        private readonly packages: Package[],
        private readonly buildScriptNames: string[],
        getDepFilter: (pkg: Package) => (dep: Package) => boolean,
    ) {
        packages.forEach((value) =>
            this.buildPackages.set(
                value.name,
                new BuildPackage(this.buildContext, value, buildScriptNames),
            ),
        );

        const needPropagate = this.buildDependencies(getDepFilter);
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

        info(
            `Starting npm script "${chalk.cyanBright(this.buildScriptNames.join(" && "))}" for ${
                this.buildPackages.size
            } packages, ${this.buildContext.taskStats.leafTotalCount} tasks`,
        );
        if (isUpToDate) {
            return BuildResult.UpToDate;
        }
        if (this.numSkippedTasks) {
            info(`Skipping ${this.numSkippedTasks} up to date tasks.`);
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

    private buildDependencies(getDepFilter: (pkg: Package) => (dep: Package) => boolean) {
        const needPropagate: BuildPackage[] = [];
        this.buildPackages.forEach((node) => {
            if (node.pkg.markForBuild) {
                needPropagate.push(node);
            }
            const depFilter = getDepFilter(node.pkg);
            for (const { name, version } of node.pkg.combinedDependencies) {
                const child = this.buildPackages.get(name);
                if (child) {
                    if (semver.satisfies(child.pkg.version, version)) {
                        if (depFilter(child.pkg)) {
                            verbose(
                                `Package dependency: ${node.pkg.nameColored} => ${child.pkg.nameColored}`,
                            );
                            node.dependentPackages.push(child);
                            child.parents.push(node);
                        } else {
                            verbose(
                                `Package dependency skipped: ${node.pkg.nameColored} => ${child.pkg.nameColored}`,
                            );
                        }
                    } else {
                        verbose(
                            `Package dependency version mismatch: ${node.pkg.nameColored} => ${child.pkg.nameColored}`,
                        );
                    }
                }
            }
        });

        return needPropagate;
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
    }

    private propagateMarkForBuild(needPropagate: BuildPackage[]) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const node = needPropagate.pop();
            if (!node) {
                break;
            }
            node.dependentPackages.forEach((child) => {
                if (!child.pkg.markForBuild) {
                    child.pkg.setMarkForBuild();
                    needPropagate.push(child);
                }
            });
        }
    }

    private filterPackagesAndInitializeTasks() {
        let hasTask = false;
        this.buildPackages.forEach((node, name) => {
            if (!node.pkg.markForBuild) {
                verbose(`${node.pkg.nameColored}: Not marked for build`);
                this.buildPackages.delete(name);
                return;
            }
            if (node.task) {
                hasTask = true;
                node.task.initializeDependentTask();
            }
        });

        if (!hasTask) {
            throw new Error(`No task for script ${this.buildScriptNames} found`);
        }
    }
}
