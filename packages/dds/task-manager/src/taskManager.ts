/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { assert, bufferToString } from "@fluidframework/common-utils";
import { IFluidSerializer } from "@fluidframework/core-interfaces";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
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
     * Mapping of taskId to a queue of clientIds that are waiting on the task.
     */
    private readonly taskQueues: Map<string, string[]> = new Map();

    /**
     * taskIds for tasks that we've sent a volunteer for but have not yet been ack'd.
     */
    private readonly pendingTaskQueues: Set<string> = new Set();

    private readonly opWatcher: EventEmitter = new EventEmitter();
    private readonly queueWatcher: EventEmitter = new EventEmitter();

    /**
     * Constructs a new task manager. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the task queue belongs to
     * @param id - optional name of the task queue
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.opWatcher.on("volunteer", (taskId: string, clientId: string) => {
            this.addClientToQueue(taskId, clientId);
        });

        this.opWatcher.on("abandon", (taskId: string, clientId: string) => {
            this.removeClientFromQueue(taskId, clientId);
        });

        runtime.getQuorum().on("removeMember", (clientId: string) => {
            this.removeClientFromAllQueues(clientId);
        });

        this.queueWatcher.on("queueChange", (taskId: string, oldLockHolder: string, newLockHolder: string) => {
            if (this.runtime.clientId === undefined) {
                // TODO handle disconnected case
                return;
            }

            if (oldLockHolder !== this.runtime.clientId && newLockHolder === this.runtime.clientId) {
                this.emit("assigned", taskId);
            } else if (oldLockHolder === this.runtime.clientId && newLockHolder !== this.runtime.clientId) {
                this.emit("lost", taskId);
            }
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
        this.pendingTaskQueues.add(taskId);
        this.submitLocalMessage(op);
    }

    public async lockTask(taskId: string) {
        if (this.haveTaskLock(taskId)) {
            return;
        }

        const lockAcquireP = new Promise<void>((res, rej) => {
            const checkIfAcquiredLock = (eventTaskId: string) => {
                if (eventTaskId !== taskId) {
                    return;
                }

                if (this.haveTaskLock(taskId)) {
                    this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                    res();
                } else if (!this.queued(taskId)) {
                    this.queueWatcher.off("queueChange", checkIfAcquiredLock);
                    rej(new Error(`Removed from queue: ${taskId}`));
                }
            };
            this.queueWatcher.on("queueChange", checkIfAcquiredLock);
        });

        if (!this.queued(taskId)) {
            // TODO simulate auto-ack in detached scenario
            this.submitVolunteerOp(taskId);
        }

        return lockAcquireP;
    }

    private submitAbandonOp(taskId: string) {
        const op: ITaskManagerAbandonOperation = {
            type: "abandon",
            taskId,
        };
        this.submitLocalMessage(op);
    }

    public abandon(taskId: string) {
        // Nothing to do if we're not at least trying to get the lock.
        if (!this.queued(taskId)) {
            return;
        }
        // TODO simulate auto-ack in detached scenario
        if (!this.isAttached()) {
            return;
        }

        this.submitAbandonOp(taskId);

        // Proactively remove ourselves from the queue without waiting for the ack.
        if (this.runtime.clientId !== undefined) {
            this.removeClientFromQueue(taskId, this.runtime.clientId);
        }
    }

    public haveTaskLock(taskId: string) {
        const currentAssignee = this.taskQueues.get(taskId)?.[0];
        return (currentAssignee !== undefined && currentAssignee === this.runtime.clientId);
    }

    public queued(taskId: string) {
        assert(this.runtime.clientId !== undefined); // TODO, handle disconnected/detached case
        const clientQueue = this.taskQueues.get(taskId);
        // If we have no queue for the taskId, then no one has signed up for it.
        return (clientQueue !== undefined && clientQueue.includes(this.runtime.clientId))
            || this.pendingTaskQueues.has(taskId);
    }

    /**
     * Create a snapshot for the task manager
     *
     * @returns the snapshot of the current state of the task manager
     */
    protected snapshotCore(serializer: IFluidSerializer): ITree {
        const content = [...this.taskQueues.entries()];

        // And then construct the tree for it
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry.Blob,
                    value: {
                        contents: JSON.stringify(content),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const blob = await storage.readBlob(snapshotFileName);
        const rawContent = bufferToString(blob, "utf8");
        const content = rawContent !== undefined
            ? JSON.parse(rawContent) as [string, string[]][]
            : [];

        content.forEach(([taskId, clientIdQueue]) => {
            this.taskQueues.set(taskId, clientIdQueue);
        });
        this.scrubClientsNotInQuorum();
    }

    protected initializeLocalCore() { }

    protected registerCore() { }

    protected onDisconnect() {
        // TODO knock ourselves out of the queues here probably
    }

    /**
     * Process a task manager operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            const op = message.contents as ITaskManagerOperation;

            switch (op.type) {
                case "volunteer":
                    this.opWatcher.emit("volunteer", op.taskId, message.clientId);
                    break;

                case "abandon":
                    this.opWatcher.emit("abandon", op.taskId, message.clientId);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private addClientToQueue(taskId: string, clientId: string) {
        if (clientId === this.runtime.clientId) {
            this.pendingTaskQueues.delete(taskId);
        }

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

    private removeClientFromQueue(taskId: string, clientId: string) {
        if (clientId === this.runtime.clientId) {
            this.pendingTaskQueues.delete(taskId);
        }

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
        if (clientId === this.runtime.clientId) {
            // TODO consider whether this should:
            // 1. remove from ONLY queues we have been ack'd in OR
            // 2. remove from pending queues as well, and also send abandons if we get ack'd
            this.pendingTaskQueues.clear();
        }
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
}
