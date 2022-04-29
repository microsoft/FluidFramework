/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { createSingleBlobSummary, IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { TaskManagerFactory } from "./taskManagerFactory";
import { ITaskManager, ITaskManagerEvents } from "./interfaces";

/**
 * Description of a task manager operation
 */
type ITaskManagerOperation = ITaskManagerVolunteerOperation | ITaskManagerAbandonOperation;

interface ITaskManagerVolunteerOperation {
    type: "volunteer";
    taskId: string;
}

interface ITaskManagerAbandonOperation {
    type: "abandon";
    taskId: string;
}

interface IPendingOp {
    type: "volunteer" | "abandon";
    messageId: number;
}

const snapshotFileName = "header";

/**
 * The TaskManager distributed data structure tracks queues of clients that want to exclusively run a task.
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
export class TaskManager extends SharedObject<ITaskManagerEvents> implements ITaskManager {
    /**
     * Create a new TaskManager
     *
     * @param runtime - data store runtime the new task queue belongs to
     * @param id - optional name of the task queue
     * @returns newly create task queue (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, TaskManagerFactory.Type) as TaskManager;
    }

    /**
     * Get a factory for TaskManager to register with the data store.
     *
     * @returns a factory that creates and load TaskManager
     */
    public static getFactory(): IChannelFactory {
        return new TaskManagerFactory();
    }

    /**
     * Mapping of taskId to a queue of clientIds that are waiting on the task.  Maintains the consensus state of the
     * queue, even if we know we've submitted an op that should eventually modify the queue.
     */
    private readonly taskQueues: Map<string, string[]> = new Map();

    // opWatcher emits for every op on this data store.  This is just a repackaging of processCore into events.
    private readonly opWatcher: EventEmitter = new EventEmitter();
    // queueWatcher emits an event whenever the consensus state of the task queues changes
    // TODO currently could event even if the queue doesn't actually change
    private readonly queueWatcher: EventEmitter = new EventEmitter();
    // abandonWatcher emits an event whenever the local client calls abandon() on a task.
    private readonly abandonWatcher: EventEmitter = new EventEmitter();
    // disconnectWatcher emits an event whenever we get disconnected.
    private readonly disconnectWatcher: EventEmitter = new EventEmitter();

    private messageId: number = -1;
    /**
     * Tracks the most recent pending op for a given task
     */
    private readonly latestPendingOps: Map<string, IPendingOp> = new Map();

    /**
     * Constructs a new task manager. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the task queue belongs to
     * @param id - optional name of the task queue
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.opWatcher.on("volunteer", (taskId: string, clientId: string, local: boolean, messageId: number) => {
            // We're tracking local ops from this connection. Filter out local ops during "connecting"
            // state since these were sent on the prior connection and were already cleared from the latestPendingOps.
            if (runtime.connected && local) {
                const pendingOp = this.latestPendingOps.get(taskId);
                assert(pendingOp !== undefined, 0x07b /* "Unexpected op" */);
                // Need to check the id, since it's possible to volunteer and abandon multiple times before the acks
                if (messageId === pendingOp.messageId) {
                    assert(pendingOp.type === "volunteer", 0x07c /* "Unexpected op type" */);
                    // Delete the pending, because we no longer have an outstanding op
                    this.latestPendingOps.delete(taskId);
                }
            }

            this.addClientToQueue(taskId, clientId);
        });

        this.opWatcher.on("abandon", (taskId: string, clientId: string, local: boolean, messageId: number) => {
            if (runtime.connected && local) {
                const pendingOp = this.latestPendingOps.get(taskId);
                assert(pendingOp !== undefined, 0x07d /* "Unexpected op" */);
                // Need to check the id, since it's possible to abandon and volunteer multiple times before the acks
                if (messageId === pendingOp.messageId) {
                    assert(pendingOp.type === "abandon", 0x07e /* "Unexpected op type" */);
                    // Delete the pending, because we no longer have an outstanding op
                    this.latestPendingOps.delete(taskId);
                }
            }

            this.removeClientFromQueue(taskId, clientId);
        });

        runtime.getQuorum().on("removeMember", (clientId: string) => {
            this.removeClientFromAllQueues(clientId);
        });

        this.queueWatcher.on("queueChange", (taskId: string, oldLockHolder: string, newLockHolder: string) => {
            // Exit early if we are still catching up on reconnect -- we can't be the leader yet anyway.
            if (this.runtime.clientId === undefined) {
                return;
            }

            if (oldLockHolder !== this.runtime.clientId && newLockHolder === this.runtime.clientId) {
                this.emit("assigned", taskId);
            } else if (oldLockHolder === this.runtime.clientId && newLockHolder !== this.runtime.clientId) {
                this.emit("lost", taskId);
            }
        });

        this.disconnectWatcher.on("disconnect", () => {
            assert(this.runtime.clientId !== undefined, 0x1d3 /* "Missing client id on disconnect" */);

            // We don't modify the taskQueues on disconnect (they still reflect the latest known consensus state).
            // After reconnect these will get cleaned up by observing the clientLeaves.
            // However we do need to recognize that we lost the lock if we had it.  Calls to .queued() and
            // .haveTaskLock() are also connection-state-aware to be consistent.
            for (const [taskId, clientQueue] of this.taskQueues.entries()) {
                if (clientQueue[0] === this.runtime.clientId) {
                    this.emit("lost", taskId);
                }
            }

            // All of our outstanding ops will be for the old clientId even if they get ack'd
            this.latestPendingOps.clear();
        });
    }

    // TODO Remove or hide from interface, this is just for debugging
    public _getTaskQueues() {
        return this.taskQueues;
    }

    private submitVolunteerOp(taskId: string) {
        const op: ITaskManagerVolunteerOperation = {
            type: "volunteer",
            taskId,
        };
        const pendingOp: IPendingOp = {
            type: "volunteer",
            messageId: ++this.messageId,
        };
        this.submitLocalMessage(op, pendingOp.messageId);
        this.latestPendingOps.set(taskId, pendingOp);
    }

    private submitAbandonOp(taskId: string) {
        const op: ITaskManagerAbandonOperation = {
            type: "abandon",
            taskId,
        };
        const pendingOp: IPendingOp = {
            type: "abandon",
            messageId: ++this.messageId,
        };
        this.submitLocalMessage(op, pendingOp.messageId);
        this.latestPendingOps.set(taskId, pendingOp);
    }

    public async lockTask(taskId: string) {
        // If we have the lock, resolve immediately
        if (this.haveTaskLock(taskId)) {
            return;
        }

        if (!this.connected) {
            throw new Error(`Attempted to lock in disconnected state: ${taskId}`);
        }

        // This promise works even if we already have an outstanding volunteer op.
        const lockAcquireP = new Promise<void>((resolve, reject) => {
            const checkIfAcquiredLock = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                // Also check pending ops here because it's possible we are currently in the queue from a previous
                // lock attempt, but have an outstanding abandon AND the outstanding volunteer for this lock attempt.
                // If we reach the head of the queue based on the previous lock attempt, we don't want to resolve.
                if (this.haveTaskLock(taskId) && !this.latestPendingOps.has(taskId)) {
                    this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                    this.abandonWatcher.off("abandon", checkIfAbandoned);
                    this.disconnectWatcher.off("disconnect", rejectOnDisconnect);
                    resolve();
                }
            };

            const checkIfAbandoned = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                this.abandonWatcher.off("abandon", checkIfAbandoned);
                this.disconnectWatcher.off("disconnect", rejectOnDisconnect);
                reject(new Error(`Abandoned before acquiring lock: ${taskId}`));
            };

            const rejectOnDisconnect = () => {
                this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                this.abandonWatcher.off("abandon", checkIfAbandoned);
                this.disconnectWatcher.off("disconnect", rejectOnDisconnect);
                reject(new Error(`Disconnected before acquiring lock: ${taskId}`));
            };

            this.queueWatcher.on("queueChange", checkIfAcquiredLock);
            this.abandonWatcher.on("abandon", checkIfAbandoned);
            this.disconnectWatcher.on("disconnect", rejectOnDisconnect);
        });

        if (!this.queued(taskId)) {
            // TODO simulate auto-ack in detached scenario
            this.submitVolunteerOp(taskId);
        }
        return lockAcquireP;
    }

    public abandon(taskId: string) {
        if (!this.connected) {
            throw new Error(`Attempted to abandon in disconnected state: ${taskId}`);
        }

        // Nothing to do if we're not at least trying to get the lock.
        if (!this.queued(taskId)) {
            return;
        }
        // TODO simulate auto-ack in detached scenario
        if (!this.isAttached()) {
            return;
        }

        this.submitAbandonOp(taskId);
        this.abandonWatcher.emit("abandon", taskId);
    }

    public haveTaskLock(taskId: string) {
        if (!this.connected) {
            return false;
        }

        const currentAssignee = this.taskQueues.get(taskId)?.[0];
        return currentAssignee !== undefined
            && currentAssignee === this.runtime.clientId
            && !this.latestPendingOps.has(taskId);
    }

    public queued(taskId: string) {
        if (!this.connected) {
            return false;
        }

        assert(this.runtime.clientId !== undefined,
            0x07f /* "clientId undefined" */); // TODO, handle disconnected/detached case

        const clientQueue = this.taskQueues.get(taskId);
        // If we have no queue for the taskId, then no one has signed up for it.
        return (
            clientQueue !== undefined
            && clientQueue.includes(this.runtime.clientId)
            && !this.latestPendingOps.has(taskId)
        )
            || this.latestPendingOps.get(taskId)?.type === "volunteer";
    }

    /**
     * Create a summary for the task manager
     *
     * @returns the summary of the current state of the task manager
     * @internal
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        // TODO filter out tasks with no clients, some are still getting in.
        const content = [...this.taskQueues.entries()];
        return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     * @internal
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<[string, string[]][]>(storage, snapshotFileName);
        content.forEach(([taskId, clientIdQueue]) => {
            this.taskQueues.set(taskId, clientIdQueue);
        });
        this.scrubClientsNotInQuorum();
    }

    /**
     * @internal
     */
    protected initializeLocalCore() { }

    /**
     * @internal
     */
    protected onDisconnect() {
        this.disconnectWatcher.emit("disconnect");
    }

    //
    /**
     * Override resubmit core to avoid resubmission on reconnect.  On disconnect we accept our removal from the
     * queues, and leave it up to the user to decide whether they want to attempt to re-enter a queue on reconnect.
     * @internal
     */
    protected reSubmitCore() { }

    /**
     * Process a task manager operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            const op = message.contents as ITaskManagerOperation;
            const messageId = localOpMetadata as number;

            switch (op.type) {
                case "volunteer":
                    this.opWatcher.emit("volunteer", op.taskId, message.clientId, local, messageId);
                    break;

                case "abandon":
                    this.opWatcher.emit("abandon", op.taskId, message.clientId, local, messageId);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private addClientToQueue(taskId: string, clientId: string) {
        if (this.runtime.getQuorum().getMembers().has(clientId)) {
            // Create the queue if it doesn't exist, and push the client on the back.
            let clientQueue = this.taskQueues.get(taskId);
            if (clientQueue === undefined) {
                clientQueue = [];
                this.taskQueues.set(taskId, clientQueue);
            }

            const oldLockHolder = clientQueue[0];
            clientQueue.push(clientId);
            const newLockHolder = clientQueue[0];
            this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);

            // TODO remove, just for debugging
            this.emit("changed");
        }
    }

    private removeClientFromQueue(taskId: string, clientId: string) {
        const clientQueue = this.taskQueues.get(taskId);
        if (clientQueue === undefined) {
            return;
        }

        const oldLockHolder = clientQueue[0];
        const clientIdIndex = clientQueue.indexOf(clientId);
        if (clientIdIndex !== -1) {
            clientQueue.splice(clientIdIndex, 1);
            // Clean up the queue if there are no more clients in it.
            if (clientQueue.length === 0) {
                this.taskQueues.delete(taskId);
            }
        }
        const newLockHolder = clientQueue[0];
        this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);

        // TODO remove, just for debugging
        this.emit("changed");
    }

    private removeClientFromAllQueues(clientId: string) {
        for (const taskId of this.taskQueues.keys()) {
            this.removeClientFromQueue(taskId, clientId);
        }
    }

    // This seems like it should be unnecessary if we can trust to receive the join/leave messages and
    // also have an accurate snapshot.
    private scrubClientsNotInQuorum() {
        const quorum = this.runtime.getQuorum();
        for (const [taskId, clientQueue] of this.taskQueues) {
            const filteredClientQueue = clientQueue.filter((clientId) => quorum.getMember(clientId) !== undefined);
            if (clientQueue.length !== filteredClientQueue.length) {
                if (filteredClientQueue.length === 0) {
                    this.taskQueues.delete(taskId);
                } else {
                    this.taskQueues.set(taskId, filteredClientQueue);
                }
                // TODO remove, just for debugging
                this.emit("changed");
                this.queueWatcher.emit("queueChange", taskId);
            }
        }
    }

    public applyStashedOp() {
        throw new Error("not implemented");
    }
}
