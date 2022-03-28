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

/**
 * The accepted value information, if any.
 */
type AcceptedQuorumValue = {
    /**
     * The accepted value.
     */
    value: any;

    /**
     * The sequence number when the value was accepted.
     */
    sequenceNumber: number;
};

/**
 * The pending change information, if any.
 */
type PendingQuorumValue = {
    type: "set";
    value: any;
    sequenceNumber: number;
} | {
    type: "delete";
    sequenceNumber: number;
};

/**
 * Internal format of the values stored in the Quorum.
 */
type QuorumValue =
    { accepted: AcceptedQuorumValue; pending: undefined; }
    | { accepted: undefined; pending: PendingQuorumValue; }
    | { accepted: AcceptedQuorumValue; pending: PendingQuorumValue; };

/**
 * Quorum operation format
 * TODO: Consider a delete operation
 */
interface IQuorumSetOperation {
    type: "set";
    key: string;
    value: any;

    // Message can be delivered with delay - resubmitted on reconnect.
    // As such, refSeq needs to reference seq # at the time op was created,
    // not when op was actually sent over wire (ISequencedDocumentMessage.referenceSequenceNumber),
    // as client can ingest ops in between.
    refSeq: number;
}

interface IQuorumNoOpOperation {
    type: "noop";
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type IQuorumOperation = IQuorumSetOperation | IQuorumNoOpOperation;

const snapshotFileName = "header";

/**
 * The Quorum distributed data structure provides key/value storage with a cautious conflict resolution strategy.
 * This strategy optimizes for all clients being aware of the change prior to considering the value as accepted.
 *
 * It is still experimental and under development.  Please do try it out, but expect breaking changes in the future.
 *
 * @remarks
 * ### Creation
 *
 * To create a `Quorum`, call the static create method:
 *
 * ```typescript
 * const quorum = Quorum.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * Setting and reading values is somewhat similar to a `SharedMap`.  However, because the acceptance strategy
 * cannot be resolved until other clients have witnessed the set, the set is an async operation and the read will
 * not reflect the set value immediately.
 *
 * ```typescript
 * quorum.set("myKey", "myValue")
 *     .then(() => { console.log(quorum.get("myKey")); })
 *     .catch((err) => { console.error(err); });
 *
 * // Reading from the quorum prior to the async operation's completion will still return the old value.
 * console.log(quorum.get("myKey"));
 * ```
 *
 * The acceptance process has two stages.  When an op indicating a client's attempt to set a value is sequenced,
 * we first verify that it was set with knowledge of the most recently accepted value (consensus-like FWW).  If it
 * meets this bar, then the value is "pending" (TODO: naming).  During this time, clients may observe the pending
 * value and act upon it, but should be aware that not all other clients may have witnessed the value yet.  Once
 * the MSN advances past the sequence number of the set, we know that all connected clients have witnessed the value
 * and the value becomes "accepted".  Once the value is accepted, it once again becomes possible to set the value,
 * again with consensus-like FWW resolution.
 *
 * TODO: Need another event to signal pending, need another method to permit read of pending.
 *
 * ### Eventing
 *
 * `Quorum` is an `EventEmitter`, and will emit events when a new value is accepted for a key.
 *
 * ```typescript
 * quorum.on("accept", (key: string) => {
 *     console.log(`New value was accepted for key: ${ key }, value: ${ quorum.get(key) }`);
 * });
 * ```
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

    private readonly values: Map<string, QuorumValue> = new Map();

    /**
     * Mapping of taskId to a queue of clientIds that are waiting on the task.  Maintains the consensus state of the
     * queue, even if we know we've submitted an op that should eventually modify the queue.
     */
    private readonly taskQueues: Map<string, string[]> = new Map();

    // disconnectWatcher emits an event whenever we get disconnected.
    private readonly disconnectWatcher: EventEmitter = new EventEmitter();

    private readonly incomingOp: EventEmitter = new EventEmitter();

    /**
     * Constructs a new task manager. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the task queue belongs to
     * @param id - optional name of the task queue
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.incomingOp.on("set", this.handleIncomingSet);
        this.incomingOp.on("noop", this.handleNoOp);

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
        });
    }

    public has(key: string): boolean {
        return this.values.get(key)?.accepted !== undefined;
    }

    // TODO: have a separate method for getting the pending.
    public get(key: string): any {
        return this.values.get(key)?.accepted?.value;
    }

    public set(key: string, value: any): void {
        // TODO: handle detached scenario

        const setOp: IQuorumSetOperation = {
            type: "set",
            key,
            value,
            refSeq: this.runtime.deltaManager.lastSequenceNumber,
        };

        this.submitLocalMessage(setOp);
    }

    private handleIncomingSet(key: string, value: any, refSeq: number, setSequenceNumber: number) {
        const currentValue = this.values.get(key);
        // A proposal is valid if the value is unknown
        // or if it was made with knowledge of the most recently accepted value
        const proposalValid =
            currentValue === undefined
            || (currentValue.pending === undefined && currentValue.accepted.sequenceNumber <= refSeq);
        if (!proposalValid) {
            // Drop invalid proposals on the ground.  If set() returns a promise we will need to resolve it though.
            return;
        }

        const accepted = currentValue?.accepted;

        this.values.set(key, { accepted, pending: { type: "set", value, sequenceNumber: setSequenceNumber }});

        this.emit("pending", key);

        // Emit a noop upon a new key entering pending state, which is how we'll eventually advance it to accepted
        // TODO: Doesn't work if there's a holdout client that disconnects prior to sending noop, since we aren't
        // guaranteed to get any further message advancing the MSN.  Observing client disconnects could work.
        const noOp: IQuorumNoOpOperation = { type: "noop" };
        this.submitLocalMessage(noOp);
    }

    private handleNoOp(minimumSequenceNumber: number) {
        for (const [key, value] of this.values) {
            const pending = value.pending;
            if (pending !== undefined && minimumSequenceNumber >= pending.sequenceNumber) {
                // The pending value has settled
                if (pending.type === "set") {
                    this.values.set(key, {
                        accepted: { value: pending.value, sequenceNumber: minimumSequenceNumber },
                        pending: undefined,
                    });
                } else if (pending.type === "delete") {
                    this.values.delete(key);
                }
                this.emit("accepted", key);
            }
        }
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
                    this.incomingOp.emit("set", op.key, op.value, op.refSeq, message.sequenceNumber, localOpMetadata);
                    break;

                case "noop":
                    this.incomingOp.emit("noop", message.minimumSequenceNumber);
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
