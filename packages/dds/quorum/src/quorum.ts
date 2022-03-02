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
import { QuorumFactory } from "./quorumFactory";
import { IQuorum, IQuorumEvents } from "./interfaces";

interface IPendingOp {
    type: "volunteer" | "abandon";
    messageId: number;
}

/**
 * Quorum operation format
 */
interface IQuorumOperation {
    type: "set";
    key: string;
    value: any;

    // Message can be delivered with delay - resubmitted on reconnect.
    // As such, refSeq needs to reference seq # at the time op was created,
    // not when op was actually sent over wire (ISequencedDocumentMessage.referenceSequenceNumber),
    // as client can ingest ops in between.
    refSeq: number;
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
export class Quorum extends SharedObject<IQuorumEvents> implements IQuorum {
    /**
     * Create a new TaskManager
     *
     * @param runtime - data store runtime the new task queue belongs to
     * @param id - optional name of the task queue
     * @returns newly create task queue (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, QuorumFactory.Type) as Quorum;
    }

    /**
     * Get a factory for TaskManager to register with the data store.
     *
     * @returns a factory that creates and load TaskManager
     */
    public static getFactory(): IChannelFactory {
        return new QuorumFactory();
    }

    private readonly values: Map<string, any>;

    /**
     * Mapping of taskId to a queue of clientIds that are waiting on the task.  Maintains the consensus state of the
     * queue, even if we know we've submitted an op that should eventually modify the queue.
     */
    private readonly taskQueues: Map<string, string[]> = new Map();

    // disconnectWatcher emits an event whenever we get disconnected.
    private readonly disconnectWatcher: EventEmitter = new EventEmitter();

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

        this.values = new Map();

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

    public has(key: string): boolean {
        return this.values.has(key);
    }

    public get(key: string): any {
        return this.values.get(key);
    }

    public async set(key: string, value: any): Promise<void> {
        const setOp: IQuorumOperation = {
            type: "set",
            key,
            value,
            refSeq: this.runtime.deltaManager.lastSequenceNumber,
        }
        // TODO need to make a real promise and resolve appropriately on ack.
        this.submitLocalMessage(setOp);
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
            const op = message.contents as IQuorumOperation;

            switch (op.type) {
                case "set":
                    // TODO: do something
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    public applyStashedOp() {
        throw new Error("not implemented");
    }
}
