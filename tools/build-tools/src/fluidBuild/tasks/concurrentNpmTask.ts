/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncPriorityQueue } from "async";
import { logVerbose } from "../../common/logging";
import { NPMTask } from "./npmTask";
import { Task, TaskExec } from "./task";
import { BuildResult, BuildPackage } from "../buildGraph";

export class ConcurrentNPMTask extends NPMTask {
    constructor(node: BuildPackage, command: string, tasks: Task[]) {
        super(node, command, tasks);
    };

    protected async runTask(q: AsyncPriorityQueue<TaskExec>): Promise<BuildResult> {
        this.logVerboseTask(`Begin Concurrent Child Tasks`);
        const taskP = new Array<Promise<BuildResult>>();
        for (const task of this.subTasks) {
            taskP.push(task.run(q));
        }
        const results = await Promise.all(taskP);
        let retResult = BuildResult.UpToDate;
        for (const result of results) {
            if (result === BuildResult.Failed) {
                return BuildResult.Failed;
            }

            if (result === BuildResult.Success) {
                retResult = BuildResult.Success;
            }
        }
        this.logVerboseTask(`End Concurrent Child Tasks`);
        return retResult;
    }
}