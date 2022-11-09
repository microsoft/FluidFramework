/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncPriorityQueue } from "async";
import registerDebug from "debug";

import { defaultLogger } from "../../common/logging";
import { BuildPackage, BuildResult } from "../buildGraph";
import { LeafTask } from "./leaf/leafTask";
import { Task, TaskExec } from "./task";

const { verbose } = defaultLogger;
const traceTaskExec = registerDebug("fluid-build:task:exec");

export class NPMTask extends Task {
    constructor(node: BuildPackage, command: string, protected readonly subTasks: Task[]) {
        super(node, command);
    }

    public initializeDependentTask() {
        for (const task of this.subTasks) {
            task.initializeDependentTask();
        }
    }

    public get isLeaf() {
        return false;
    }

    public matchTask(command: string, options?: any): Task | undefined {
        if (command === this.command) {
            return this;
        }
        for (const task of this.subTasks) {
            const t = task.matchTask(command, options);
            if (t) {
                return t;
            }
        }
        return undefined;
    }

    public collectLeafTasks(leafTasks: LeafTask[]) {
        for (const task of this.subTasks) {
            task.collectLeafTasks(leafTasks);
        }
    }

    protected async checkIsUpToDate(): Promise<boolean> {
        const taskUpToDateP = new Array<Promise<boolean>>();
        for (const task of this.subTasks) {
            taskUpToDateP.push(task.isUpToDate());
        }
        const taskUpToDateArr = await Promise.all(taskUpToDateP);
        for (const taskUpToDate of taskUpToDateArr) {
            if (!taskUpToDate) {
                return false;
            }
        }
        return true;
    }
    protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        this.logVerboseTask(`Begin Child Tasks`);
        let retResult = BuildResult.UpToDate;
        for (const task of this.subTasks) {
            const result = await task.run(q);
            if (result === BuildResult.Failed) {
                return BuildResult.Failed;
            }

            if (result === BuildResult.Success) {
                retResult = BuildResult.Success;
            }
        }
        this.logVerboseTask(`End Child Tasks`);
        return retResult;
    }

    protected logVerboseTask(msg: string) {
        const out = `Task: ${this.node.pkg.nameColored} ${this.command}: ${msg}`;
        traceTaskExec(out);
        verbose(out);
    }
}
