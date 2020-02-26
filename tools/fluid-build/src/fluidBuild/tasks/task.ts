/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { priorityQueue, AsyncPriorityQueue } from "async";

import { BuildResult, BuildPackage } from "../buildGraph";

import { LeafTask } from "./leaf/leafTask";

import { options } from "../options";

export interface TaskExec {
    task: LeafTask;
    resolve: (value: BuildResult) => void;
};

export abstract class Task {
    public static createTaskQueue(): AsyncPriorityQueue<TaskExec> {
        return priorityQueue(async (taskExec: TaskExec, callback) => {
            taskExec.resolve(await taskExec.task.exec());
            callback();
        }, options.concurrency);
    }

    private runP?: Promise<BuildResult>;
    private isUpToDateP?: Promise<boolean>;

    protected constructor(protected readonly node: BuildPackage, public readonly command: string) {
    }

    public get package() {
        return this.node.pkg;
    }

    public async run(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        if (await this.isUpToDate()) {
            return BuildResult.UpToDate;
        }
        if (!this.runP) {
            this.runP = this.runTask(q);
        }
        return this.runP;
    }

    public async isUpToDate(): Promise<boolean> {
        // Always not up to date if forced
        if (this.forced) { return false; }

        if (this.isUpToDateP === undefined) {
            this.isUpToDateP = this.checkIsUpToDate();
        }
        return this.isUpToDateP;
    }

    public toString() {
        return `"${this.command}" in ${this.node.pkg.nameColored}`;
    }

    public abstract initializeDependentTask(): void;
    public abstract get isLeaf(): boolean;
    public abstract matchTask(command: string): Task | undefined;
    public abstract collectLeafTasks(leafTasks: LeafTask[]): void;
    protected abstract async checkIsUpToDate(): Promise<boolean>;
    protected abstract async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult>;

    public get forced() {
        return options.force && (options.matchedOnly !== true || this.package.matched);
    }
};