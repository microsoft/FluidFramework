/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAgentScheduler } from "./agent";

export class TaskSubscription extends EventEmitter {
    private subscribed: boolean = false;

    public haveTask() {
        return this.agentScheduler.pickedTasks().includes(this.taskId);
    }

    constructor(private readonly agentScheduler: IAgentScheduler, public readonly taskId: string) {
        super();
        agentScheduler.on("picked", (_taskId: string) => {
            if (_taskId === this.taskId) {
                this.emit("gotTask");
            }
        });
        agentScheduler.on("lost", (_taskId: string) => {
            if (_taskId === this.taskId) {
                this.emit("lostTask");
            }
        });
    }

    public volunteer() {
        if (!this.subscribed) {
            // AgentScheduler throws if the same task is picked twice but we don't care because our
            // worker does nothing.  We only care that the AgentScheduler is trying to pick.
            // We also don't care if we throw due to failing the interactive check, because then we'll
            // just appear to never get the leadership.
            this.agentScheduler.pick(this.taskId, async () => { }).catch(() => { });
            this.subscribed = true;
        }
    }
}
