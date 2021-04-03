/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAgentScheduler } from "./agent";

const leadershipTaskId = "leader";

export class LeadershipManager extends EventEmitter {
    private subscribed: boolean = false;

    public get leader() {
        return this.agentScheduler.pickedTasks().includes(leadershipTaskId);
    }

    constructor(private readonly agentScheduler: IAgentScheduler) {
        super();
        agentScheduler.on("picked", (taskId: string) => {
            if (taskId === leadershipTaskId) {
                this.emit("leader");
            }
        });
        agentScheduler.on("lost", (taskId: string) => {
            if (taskId === leadershipTaskId) {
                this.emit("notleader");
            }
        });
    }

    public volunteerForLeadership() {
        if (!this.subscribed) {
            // AgentScheduler throws if the same task is picked twice but we don't care because our
            // worker does nothing.  We only care that the AgentScheduler is trying to pick.
            this.agentScheduler.pick(leadershipTaskId, async () => { }).catch(() => { });
            this.subscribed = true;
        }
    }
}
