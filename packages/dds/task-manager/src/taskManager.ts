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
type ITaskManagerOperation =
    ITaskManagerVolunteerOperation |
    ITaskManagerAbandonOperation |
    ITaskManagerCompletedOperation;

interface ITaskManagerVolunteerOperation {
    type: "volunteer";
    taskId: string;
}

interface ITaskManagerAbandonOperation {
    type: "abandon";
    taskId: string;
}

interface ITaskManagerCompletedOperation {
    type: "complete";
    taskId: string;
}

interface IPendingOp {
    type: "volunteer" | "abandon" | "complete";
    messageId: number;
}

const snapshotFileName = "header";

/**
 * Placeholder clientId for detached scenarios.
 */
const placeholderClientId = "placeholder";


/**
 * The TaskManager distributed data structure tracks queues of clients that want to exclusively run a task.
 *
 * @remarks
 *
 * For an in-depth overview, see [TaskManager](https://fluidframework.com/docs/data-structures/task-manager/).
 *
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
 * To volunteer for a task, use the `volunteerForTask()` method.  This returns a Promise that will resolve once the
 * client has acquired exclusive rights to run the task, or reject if the client is removed from the queue without
 * acquiring the rights.
 *
 * ```typescript
 * taskManager.volunteerForTask("NameOfTask")
 *     .then(() => { doTheTask(); })
 *     .catch((err) => { console.error(err); });
 * ```
 *
 * Alternatively, you can indefinitely volunteer for a task with the synchronous `subscribeToTask()` method. This
 * method does not return a value, therefore you need to rely on eventing to know when you have acquired the rights
 * to run the task (see below).
 *
 * ```typescript
 * taskManager.subscribeToTask("NameOfTask");
 * ```
 *
 * To check if the local client is currently subscribed to a task, use the `subscribed()` method.
 * ```typescript
 * if (taskManager.subscribed("NameOfTask")) {
 *     console.log("This client is currently subscribed to the task.");
 * }
 * ```
 *
 * To release the rights to the task, use the `abandon()` method.  The next client in the queue will then get the
 * rights to run the task.
 *
 * ```typescript
 * taskManager.abandon("NameOfTask");
 * ```
 *
 * To inspect your state in the queue, you can use the `queued()` and `assigned()` methods.
 *
 * ```typescript
 * if (taskManager.queued("NameOfTask")) {
 *     console.log("This client is somewhere in the queue, potentially even having the task assignment.");
 * }
 *
 * if (taskManager.assigned("NameOfTask")) {
 *     console.log("This client currently has the rights to run the task");
 * }
 * ```
 *
 * To signal to other connected clients that a task is completed, use the `complete()` method. This will release all
 * clients from the queue and emit the "completed" event.
 *
 * ```typescript
 * taskManager.complete("NameOfTask");
 * ```
 *
 * ### Eventing
 *
 * `TaskManager` is an `EventEmitter`, and will emit events when a task is assigned to the client, when the task
 * assignment is lost, and when a task was completed by another client.
 *
 * ```typescript
 * taskManager.on("assigned", (taskId: string) => {
 *     console.log(`Client was assigned task: ${taskId}`);
 * });
 *
 * taskManager.on("lost", (taskId: string) => {
 *     console.log(`Client released task: ${taskId}`);
 * });
 *
 * taskManager.on("completed", (taskId: string) => {
 *     console.log(`Another client completed task: ${taskId}`);
 * });
 * ```
 *
 * These can be useful if the logic to volunteer for a task is separated from the logic to perform the task, such as
 * when using the `subscribeToTask()` method.
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
    private readonly queueWatcher: EventEmitter = new EventEmitter();
    // abandonWatcher emits an event whenever the local client calls abandon() on a task.
    private readonly abandonWatcher: EventEmitter = new EventEmitter();
    // connectionWatcher emits an event whenever we get connected or disconnected.
    private readonly connectionWatcher: EventEmitter = new EventEmitter();
    // completedWatcher emits an event whenever the local client receives a completed op.
    private readonly completedWatcher: EventEmitter = new EventEmitter();

    private messageId: number = -1;
    /**
     * Tracks the most recent pending op for a given task
     */
    private readonly latestPendingOps: Map<string, IPendingOp> = new Map();

    /**
     * Tracks tasks that are this client is currently subscribed to.
     */
    private readonly subscribedTasks: Set<string> = new Set();

    /**
     * Map to track tasks that have pending complete ops.
     */
    private readonly pendingCompletedTasks: Map<string, number[]> = new Map();

    /**
     * Returns the clientId. Will return a placeholder if the runtime is detached and not yet assigned a clientId.
     */
    private get clientId(): string | undefined {
        return this.isAttached() ? this.runtime.clientId : placeholderClientId;
    }

    /**
     * Constructs a new task manager. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the task queue belongs to
     * @param id - optional name of the task queue
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes, "fluid_taskManager_");

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

        this.opWatcher.on("complete", (taskId: string, clientId: string, local: boolean, messageId: number) => {
            if (runtime.connected && local) {
                const pendingOp = this.latestPendingOps.get(taskId);
                assert(pendingOp !== undefined, 0x400 /* Unexpected op */);
                // Need to check the id, since it's possible to complete multiple times before the acks
                if (messageId === pendingOp.messageId) {
                    assert(pendingOp.type === "complete", 0x401 /* Unexpected op type */);
                    // Delete the pending, because we no longer have an outstanding op
                    this.latestPendingOps.delete(taskId);
                }

                // Remove complete op from this.pendingCompletedTasks
                const pendingIds = this.pendingCompletedTasks.get(taskId);
                assert(pendingIds !== undefined && pendingIds.length > 0, 0x402 /* pendingIds is empty */);
                const removed = pendingIds.shift();
                assert(removed === messageId, 0x403 /* Removed complete op id does not match */);
            }

            // For clients in queue, we need to remove them from the queue and raise the proper events.
            if (!local) {
                this.taskQueues.delete(taskId);
                this.completedWatcher.emit("completed", taskId);
                this.emit("completed", taskId);
            }
        });

        runtime.getQuorum().on("removeMember", (clientId: string) => {
            this.removeClientFromAllQueues(clientId);
        });

        this.queueWatcher.on("queueChange", (taskId: string, oldLockHolder: string, newLockHolder: string) => {
            // If oldLockHolder is placeholderClientId we need to emit the task was lost during the attach process
            if (oldLockHolder === placeholderClientId) {
                this.emit("lost", taskId);
                return;
            }

            // Exit early if we are still catching up on reconnect -- we can't be the leader yet anyway.
            if (this.clientId === undefined) {
                return;
            }

            if (oldLockHolder !== this.clientId && newLockHolder === this.clientId) {
                this.emit("assigned", taskId);
            } else if (oldLockHolder === this.clientId && newLockHolder !== this.clientId) {
                this.emit("lost", taskId);
            }
        });

        this.connectionWatcher.on("disconnect", () => {
            assert(this.clientId !== undefined, 0x1d3 /* "Missing client id on disconnect" */);

            // We don't modify the taskQueues on disconnect (they still reflect the latest known consensus state).
            // After reconnect these will get cleaned up by observing the clientLeaves.
            // However we do need to recognize that we lost the lock if we had it.  Calls to .queued() and
            // .assigned() are also connection-state-aware to be consistent.
            for (const [taskId, clientQueue] of this.taskQueues.entries()) {
                if (this.isAttached() && clientQueue[0] === this.clientId) {
                    this.emit("lost", taskId);
                }
            }

            // All of our outstanding ops will be for the old clientId even if they get ack'd
            this.latestPendingOps.clear();
        });
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

    private submitCompleteOp(taskId: string) {
        const op: ITaskManagerCompletedOperation = {
            type: "complete",
            taskId,
        };
        const pendingOp: IPendingOp = {
            type: "complete",
            messageId: ++this.messageId,
        };

        if (this.pendingCompletedTasks.has(taskId)) {
            this.pendingCompletedTasks.get(taskId)?.push(pendingOp.messageId);
        } else {
            this.pendingCompletedTasks.set(taskId, [pendingOp.messageId]);
        }

        this.submitLocalMessage(op, pendingOp.messageId);
        this.latestPendingOps.set(taskId, pendingOp);
    }

    /**
     * {@inheritDoc ITaskManager.volunteerForTask}
     */
    public async volunteerForTask(taskId: string) {
        // If we have the lock, resolve immediately
        if (this.assigned(taskId)) {
            return true;
        }

        if (!this.isAttached()) {
            // Simulate auto-ack in detached scenario
            assert(this.clientId !== undefined, "clientId should not be undefined");
            this.addClientToQueue(taskId, this.clientId);
            return true;
        }

        if (!this.connected) {
            throw new Error(`Attempted to volunteer in disconnected state: ${taskId}`);
        }

        // This promise works even if we already have an outstanding volunteer op.
        const lockAcquireP = new Promise<boolean>((resolve, reject) => {
            const checkIfAcquiredLock = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                // Also check pending ops here because it's possible we are currently in the queue from a previous
                // lock attempt, but have an outstanding abandon AND the outstanding volunteer for this lock attempt.
                // If we reach the head of the queue based on the previous lock attempt, we don't want to resolve.
                if (this.assigned(taskId) && !this.latestPendingOps.has(taskId)) {
                    this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                    this.abandonWatcher.off("abandon", checkIfAbandoned);
                    this.connectionWatcher.off("disconnect", rejectOnDisconnect);
                    this.completedWatcher.off("completed", checkIfCompleted);
                    resolve(true);
                }
            };

            const checkIfAbandoned = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                this.abandonWatcher.off("abandon", checkIfAbandoned);
                this.connectionWatcher.off("disconnect", rejectOnDisconnect);
                this.completedWatcher.off("completed", checkIfCompleted);
                reject(new Error(`Abandoned before acquiring task assignment: ${taskId}`));
            };

            const rejectOnDisconnect = () => {
                this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                this.abandonWatcher.off("abandon", checkIfAbandoned);
                this.connectionWatcher.off("disconnect", rejectOnDisconnect);
                this.completedWatcher.off("completed", checkIfCompleted);
                reject(new Error(`Disconnected before acquiring task assignment: ${taskId}`));
            };

            const checkIfCompleted = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                this.abandonWatcher.off("abandon", checkIfAbandoned);
                this.connectionWatcher.off("disconnect", rejectOnDisconnect);
                this.completedWatcher.off("completed", checkIfCompleted);
                resolve(false);
            };

            this.queueWatcher.on("queueChange", checkIfAcquiredLock);
            this.abandonWatcher.on("abandon", checkIfAbandoned);
            this.connectionWatcher.on("disconnect", rejectOnDisconnect);
            this.completedWatcher.on("completed", checkIfCompleted);
        });

        if (!this.queued(taskId)) {
            this.submitVolunteerOp(taskId);
        }
        return lockAcquireP;
    }

    /**
     * {@inheritDoc ITaskManager.subscribeToTask}
     */
    public subscribeToTask(taskId: string) {
        if (this.subscribed(taskId)) {
            return;
        }

        const submitVolunteerOp = () => {
            this.submitVolunteerOp(taskId);
        };

        const disconnectHandler = () => {
            // Wait to be connected again and then re-submit volunteer op
            this.connectionWatcher.once("connect", submitVolunteerOp);
        };

        const checkIfAbandoned = (eventTaskId: string) => {
            if (eventTaskId !== taskId) {
                return;
            }

            this.abandonWatcher.off("abandon", checkIfAbandoned);
            this.connectionWatcher.off("disconnect", disconnectHandler);
            this.connectionWatcher.off("connect", submitVolunteerOp);
            this.completedWatcher.off("completed", checkIfCompleted);

            this.subscribedTasks.delete(taskId);
        };

        const checkIfCompleted = (eventTaskId: string) => {
            if (eventTaskId !== taskId) {
                return;
            }

            this.abandonWatcher.off("abandon", checkIfAbandoned);
            this.connectionWatcher.off("disconnect", disconnectHandler);
            this.connectionWatcher.off("connect", submitVolunteerOp);
            this.completedWatcher.off("completed", checkIfCompleted);

            this.subscribedTasks.delete(taskId);
        };

        this.abandonWatcher.on("abandon", checkIfAbandoned);
        this.connectionWatcher.on("disconnect", disconnectHandler);
        this.completedWatcher.on("completed", checkIfCompleted);

        if (!this.isAttached()) {
            // Simulate auto-ack in detached scenario
            assert(this.clientId !== undefined, "clientId should not be undefined");
            this.addClientToQueue(taskId, this.clientId);
            // Because we volunteered with placeholderClientId, we need to wait for when we attach and are assigned
            // a real clientId. At that point we should re-enter the queue with a real volunteer op (assuming we are
            // connected).
            this.runtime.once("attached", () => {
                if (this.queued(taskId)) {
                    // If we are already queued, then we were able to replace the placeholderClientId with our real
                    // clientId and no action is required.
                    return;
                } else if (this.connected) {
                    submitVolunteerOp();
                } else {
                    this.connectionWatcher.once("connect", () => {
                        submitVolunteerOp();
                    });
                }
            });
        } else if (!this.connected) {
            // If we are disconnected (and attached), wait to be connected and submit volunteer op
            disconnectHandler();
        } else if (!this.assigned(taskId) && !this.queued(taskId)) {
            submitVolunteerOp();
        }
        this.subscribedTasks.add(taskId);
    }

    /**
     * {@inheritDoc ITaskManager.abandon}
     */
    public abandon(taskId: string) {
        // Always allow abandon if the client is subscribed to allow clients to unsubscribe while disconnected.
        // Otherwise, we should check to make sure the client is both connected queued for the task before sending an
        // abandon op.
        if (!this.subscribed(taskId) && !this.queued(taskId)) {
            // Nothing to do
            return;
        }

        if (!this.isAttached()) {
            // Simulate auto-ack in detached scenario
            assert(this.clientId !== undefined, "clientId is undefined");
            this.removeClientFromQueue(taskId, this.clientId);
            this.abandonWatcher.emit("abandon", taskId);
            return;
        }

        // If we're subscribed but not queued, we don't need to submit an abandon op (probably offline)
        if (this.queued(taskId)) {
            this.submitAbandonOp(taskId);
        }
        this.abandonWatcher.emit("abandon", taskId);
    }

    /**
     * {@inheritDoc ITaskManager.assigned}
     */
    public assigned(taskId: string) {
        if (this.isAttached() && !this.connected) {
            return false;
        }

        const currentAssignee = this.taskQueues.get(taskId)?.[0];
        return currentAssignee !== undefined
            && currentAssignee === this.clientId
            && !this.latestPendingOps.has(taskId);
    }

    /**
     * {@inheritDoc ITaskManager.queued}
     */
    public queued(taskId: string) {
        if (this.isAttached() && !this.connected) {
            return false;
        }

        assert(this.clientId !== undefined, 0x07f /* "clientId undefined" */);

        const clientQueue = this.taskQueues.get(taskId);
        // If we have no queue for the taskId, then no one has signed up for it.
        return (
            (clientQueue?.includes(this.clientId) ?? false)
            && !this.latestPendingOps.has(taskId)
        )
            || this.latestPendingOps.get(taskId)?.type === "volunteer";
    }

    /**
     * {@inheritDoc ITaskManager.subscribed}
     */
    public subscribed(taskId: string): boolean {
        return this.subscribedTasks.has(taskId);
    }

    /**
     * {@inheritDoc ITaskManager.complete}
     */
    public complete(taskId: string): void {
        if (!this.assigned(taskId)) {
            throw new Error(`Attempted to mark task as complete while not being assigned: ${taskId}`);
        }

        // If we are detached we will simulate auto-ack for the complete op. Therefore we only need to send the op if
        // we are attached. Additionally, we don't need to check if we are connected while detached.
        if (this.isAttached()) {
            if (!this.connected) {
                throw new Error(`Attempted to complete task in disconnected state: ${taskId}`);
            }
            this.submitCompleteOp(taskId);
        }

        this.taskQueues.delete(taskId);
        this.completedWatcher.emit("completed", taskId);
        this.emit("completed", taskId);
    }

    /**
     * Create a summary for the task manager
     *
     * @returns the summary of the current state of the task manager
     * @internal
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        if (this.runtime.clientId !== undefined) {
            // If the runtime has been assigned an actual clientId by now, we can replace the placeholder clientIds
            // and maintain the task assignment.
            this.replacePlaceholderInAllQueues();
        } else {
            // If the runtime has still not been assigned a clientId, we should not summarize with the placeholder
            // clientIds and instead remove them from the queues and require the client to re-volunteer when assigned
            // a new clientId.
            this.removeClientFromAllQueues(placeholderClientId);
        }
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
    }

    /**
     * @internal
     */
    protected initializeLocalCore() { }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
     * @internal
     */
    protected onDisconnect() {
        this.connectionWatcher.emit("disconnect");
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onConnect}
     * @internal
     */
    protected onConnect() {
        this.connectionWatcher.emit("connect");
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

                case "complete":
                    this.opWatcher.emit("complete", op.taskId, message.clientId, local, messageId);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private addClientToQueue(taskId: string, clientId: string) {
        const pendingIds = this.pendingCompletedTasks.get(taskId);
        if (pendingIds !== undefined && pendingIds.length > 0) {
            // Ignore the volunteer op if we know this task is about to be completed
            return;
        }

        // Ensure that the clientId exists in the quorum, or it is placeholderClientId (detached scenario)
        if (this.runtime.getQuorum().getMembers().has(clientId) || this.clientId === placeholderClientId) {
            // Create the queue if it doesn't exist, and push the client on the back.
            let clientQueue = this.taskQueues.get(taskId);
            if (clientQueue === undefined) {
                clientQueue = [];
                this.taskQueues.set(taskId, clientQueue);
            }

            const oldLockHolder = clientQueue[0];
            clientQueue.push(clientId);
            const newLockHolder = clientQueue[0];
            if (newLockHolder !== oldLockHolder) {
                this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);
            }

        }
    }

    private removeClientFromQueue(taskId: string, clientId: string) {
        const clientQueue = this.taskQueues.get(taskId);
        if (clientQueue === undefined) {
            return;
        }

        const oldLockHolder = clientId === placeholderClientId ? placeholderClientId : clientQueue[0];
        const clientIdIndex = clientQueue.indexOf(clientId);
        if (clientIdIndex !== -1) {
            clientQueue.splice(clientIdIndex, 1);
            // Clean up the queue if there are no more clients in it.
            if (clientQueue.length === 0) {
                this.taskQueues.delete(taskId);
            }
        }
        const newLockHolder = clientQueue[0];
        if (newLockHolder !== oldLockHolder) {
            this.queueWatcher.emit("queueChange", taskId, oldLockHolder, newLockHolder);
        }
    }

    private removeClientFromAllQueues(clientId: string) {
        for (const taskId of this.taskQueues.keys()) {
            this.removeClientFromQueue(taskId, clientId);
        }
    }

    /**
     * Will replace all instances of the placeholderClientId with the current clientId. This should only be called when
     * transitioning from detached to attached and this.runtime.clientId is defined.
     */
    private replacePlaceholderInAllQueues() {
        assert(this.runtime.clientId !== undefined, "this.runtime.clientId should be defined");
        for (const clientQueue of this.taskQueues.values()) {
            const clientIdIndex = clientQueue.indexOf(placeholderClientId);
            if (clientIdIndex !== -1) {
                clientQueue[clientIdIndex] = this.runtime.clientId;
            }
        }
    }

    public applyStashedOp() {
        throw new Error("not implemented");
    }
}
