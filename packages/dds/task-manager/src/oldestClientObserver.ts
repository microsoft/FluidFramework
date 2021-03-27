/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IQuorum } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IOldestClientObserver } from "./interfaces";

/**
 * The `OldestClientObserver` is a utility to observe a `Quorum` for changes to which client is the oldest.
 *
 * It is still experimental and under development.  Please do try it out, but expect breaking changes in the future.
 *
 * @remarks
 * ### Creation
 *
 * To create a `TaskManager`, call the static create method:
 *
 * ```typescript
 * const taskManager = TaskManager.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * To volunteer for a task, use the `lockTask()` method.  This returns a Promise that will resolve once the client
 * has acquired exclusive rights to run the task, or reject if the client is removed from the queue without acquiring
 * the rights.
 *
 * ```typescript
 * taskManager.lockTask("NameOfTask")
 *     .then(() => { doTheTask(); })
 *     .catch((err) => { console.error(err); });
 * ```
 *
 * To release the rights to the task, use the `abandon()` method.  The next client in the queue will then get the
 * rights to run the task.
 *
 * ```typescript
 * taskManager.abandon("NameOfTask");
 * ```
 *
 * To inspect your state in the queue, you can use the `queued()` and `haveTaskLock()` methods.
 *
 * ```typescript
 * if (taskManager.queued("NameOfTask")) {
 *     console.log("This client is somewhere in the queue, potentially even having the lock");
 * }
 *
 * if (taskManager.queued("NameOfTask")) {
 *     console.log("This client currently has the rights to run the task");
 * }
 * ```
 *
 * ### Eventing
 *
 * `TaskManager` is an `EventEmitter`, and will emit events when a task is assigned to the client or released.
 *
 * ```typescript
 * taskManager.on("assigned", (taskId: string) => {
 *     console.log(`Client was assigned task: ${taskId}`);
 * });
 *
 * taskManager.on("lost", (taskId: string) => {
 *     console.log(`Client released task: ${taskId}`);
 * });
 * ```
 *
 * These can be useful if the logic to volunteer for a task is separated from the logic to perform the task and it's
 * not convenient to pass the Promise around.
 */
export class OldestClientObserver extends EventEmitter implements IOldestClientObserver {
    private currentIsOldest: boolean = false;
    constructor(private readonly quorum: IQuorum, private readonly containerRuntime: IContainerRuntime) {
        super();
        this.currentIsOldest = this.computeIsOldest();
        quorum.on("addMember", this.updateOldest);
        quorum.on("removeMember", this.updateOldest);
        containerRuntime.on("disconnected", this.updateOldest);
    }

    public isOldest(): boolean {
        return this.currentIsOldest;
    }

    private readonly updateOldest = () => {
        const oldest = this.computeIsOldest();
        if (this.currentIsOldest !== oldest) {
            this.currentIsOldest = oldest;
            if (oldest) {
                this.emit("becameOldest");
            } else {
                this.emit("lostOldest");
            }
        }
    };

    private computeIsOldest(): boolean {
        if (this.containerRuntime.clientId === undefined) {
            return false;
        }

        const members = this.quorum.getMembers();
        if (members.size === 0) {
            return false;
        }

        let oldestClient: { clientId: string, sequenceNumber: number } | undefined;
        for (const [clientId, sequencedClient] of members.entries()) {
            if (oldestClient === undefined || sequencedClient.sequenceNumber < oldestClient.sequenceNumber) {
                oldestClient = {
                    clientId,
                    sequenceNumber: sequencedClient.sequenceNumber,
                };
            }
        }

        return oldestClient?.clientId === this.containerRuntime.clientId;
    }
}
