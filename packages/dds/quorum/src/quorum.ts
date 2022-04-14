/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import { EventEmitter } from "events";

// import { assert } from "@fluidframework/common-utils";
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
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
    // TODO: Consider using Set and serializing to array for snapshot
    expectedSignoffs: string[];
} | {
    type: "delete";
    sequenceNumber: number;
    // TODO: Consider using Set and serializing to array for snapshot
    expectedSignoffs: string[];
};

/**
 * Internal format of the values stored in the Quorum.
 */
type QuorumValue =
    { accepted: AcceptedQuorumValue; pending: undefined; }
    | { accepted: undefined; pending: PendingQuorumValue; }
    | { accepted: AcceptedQuorumValue; pending: PendingQuorumValue; };

/**
 * Quorum operation formats
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

interface IQuorumDeleteOperation {
    type: "delete";
    key: string;
    // Same as above for set.
    refSeq: number;
}

interface IQuorumAcceptOperation {
    type: "accept";
    key: string;
    // The sequence number when the value went pending.
    // To be used to validate that we are accepting the correct intended value.
    pendingSeq: number;
}

type IQuorumOperation = IQuorumSetOperation | IQuorumDeleteOperation | IQuorumAcceptOperation;

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
 * all clients that were connected at the time of the value being set have explicitly acknowledged the new value,
 * the value becomes "accepted".  Once the value is accepted, it once again becomes possible to set the value,
 * again with consensus-like FWW resolution.
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
     * Create a new Quorum
     *
     * @param runtime - data store runtime the new quorum belongs to
     * @param id - optional name of the quorum
     * @returns newly created quorum (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string): Quorum {
        return runtime.createChannel(id, QuorumFactory.Type) as Quorum;
    }

    /**
     * Get a factory for Quorum to register with the data store.
     *
     * @returns a factory that creates and load Quorum
     */
    public static getFactory(): IChannelFactory {
        return new QuorumFactory();
    }

    private readonly values: Map<string, QuorumValue> = new Map();

    // disconnectWatcher emits an event whenever we get disconnected.
    private readonly disconnectWatcher: EventEmitter = new EventEmitter();

    private readonly incomingOp: EventEmitter = new EventEmitter();

    /**
     * Constructs a new quorum. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the quorum belongs to
     * @param id - optional name of the quorum
     */
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    public constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.incomingOp.on("set", this.handleIncomingSet);
        this.incomingOp.on("delete", this.handleIncomingDelete);
        this.incomingOp.on("accept", this.handleIncomingAcceptOp);

        this.disconnectWatcher.on("disconnect", () => {
            // assert(this.runtime.clientId !== undefined, 0x1d3 /* "Missing client id on disconnect" */);
            // TODO Handle appropriately
        });
    }

    /**
     * {@inheritDoc IQuorum.has}
     */
    public has(key: string): boolean {
        return this.values.get(key)?.accepted !== undefined;
    }

    /**
     * {@inheritDoc IQuorum.get}
     */
    public get(key: string): any {
        return this.values.get(key)?.accepted?.value;
    }

    /**
     * {@inheritDoc IQuorum.getPending}
     */
    public getPending(key: string): any {
        // TODO: Should this return differently for a value of undefined vs. a pending delete?
        const pending = this.values.get(key)?.pending;
        if (pending === undefined || pending.type === "delete") {
            return undefined;
        }

        return pending.value;
    }

    /**
     * {@inheritDoc IQuorum.set}
     */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public set(key: string, value: any): void {
        // TODO: handle detached scenario, just auto accept basically

        const setOp: IQuorumSetOperation = {
            type: "set",
            key,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            value,
            refSeq: this.runtime.deltaManager.lastSequenceNumber,
        };

        this.submitLocalMessage(setOp);
    }

    /**
     * {@inheritDoc IQuorum.delete}
     */
    public delete(key: string): void {
        // TODO: handle detached scenario, just auto accept basically

        const deleteOp: IQuorumDeleteOperation = {
            type: "delete",
            key,
            refSeq: this.runtime.deltaManager.lastSequenceNumber,
        };

        this.submitLocalMessage(deleteOp);
    }

    private readonly handleIncomingSet = (
        key: string,
        value: any,
        refSeq: number,
        setSequenceNumber: number,
        clientId: string,
    ): void => {
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

        // We expect signoffs from all connected clients at the time the set was sequenced, except for the client
        // who issued the set (who implicitly signs off).
        const connectedClientIds = [...this.runtime.getQuorum().getMembers().keys()];
        const expectedSignoffs = connectedClientIds.filter((quorumMemberId) => quorumMemberId !== clientId);

        const newQuorumValue: QuorumValue = {
            accepted,
            pending: {
                type: "set",
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                value,
                sequenceNumber: setSequenceNumber,
                expectedSignoffs,
            },
        };

        this.values.set(key, newQuorumValue);

        this.emit("pending", key);

        if (this.runtime.clientId !== undefined && expectedSignoffs.includes(this.runtime.clientId)) {
            // Emit an accept upon a new key entering pending state, which is how we'll eventually advance it to
            // accepted state.
            // TODO: Doesn't work if there's a holdout client that disconnects prior to sending accept.  Observing
            // client disconnects should work.
            const acceptOp: IQuorumAcceptOperation = {
                type: "accept",
                key,
                pendingSeq: setSequenceNumber,
            };
            this.submitLocalMessage(acceptOp);
        }
    };

    private readonly handleIncomingDelete = (
        key: string,
        refSeq: number,
        deleteSequenceNumber: number,
        clientId: string,
    ): void => {
        const currentValue = this.values.get(key);
        // A proposal is valid if the value is unknown
        // or if it was made with knowledge of the most recently accepted value
        const proposalValid =
            currentValue === undefined
            || (currentValue.pending === undefined && currentValue.accepted.sequenceNumber <= refSeq);
        if (!proposalValid) {
            // Drop invalid proposals on the ground.  If delete() returns a promise we will need to resolve it though.
            return;
        }

        const accepted = currentValue?.accepted;

        // We expect signoffs from all connected clients at the time the delete was sequenced, except for the client
        // who issued the delete (who implicitly signs off).
        const connectedClientIds = [...this.runtime.getQuorum().getMembers().keys()];
        const expectedSignoffs = connectedClientIds.filter((quorumMemberId) => quorumMemberId !== clientId);

        const newQuorumValue: QuorumValue = {
            accepted,
            pending: {
                type: "delete",
                sequenceNumber: deleteSequenceNumber,
                expectedSignoffs,
            },
        };

        this.values.set(key, newQuorumValue);

        this.emit("pending", key);

        if (this.runtime.clientId !== undefined && expectedSignoffs.includes(this.runtime.clientId)) {
            // Emit an accept upon a new key entering pending state, which is how we'll eventually advance it to
            // accepted state.
            // TODO: Doesn't work if there's a holdout client that disconnects prior to sending accept.  Observing
            // client disconnects should work.
            const acceptOp: IQuorumAcceptOperation = {
                type: "accept",
                key,
                pendingSeq: deleteSequenceNumber,
            };
            this.submitLocalMessage(acceptOp);
        }
    };

    private readonly handleIncomingAcceptOp = (
        key: string,
        pendingSeq: number,
        clientId: string,
        sequenceNumber: number,
    ): void => {
        const pending = this.values.get(key)?.pending;
        if (pending === undefined
            || pending.sequenceNumber !== pendingSeq
            || !pending.expectedSignoffs.includes(clientId)) {
            // TODO: This is probably going to happen normally, esp. for resubmit on reconnect.
            // It shouldn't always be an error.
            throw new Error("Got an unexpected accept");
        }

        // Remove the client from the expected signoffs
        pending.expectedSignoffs = pending.expectedSignoffs.filter(
            (expectedClientId) => expectedClientId !== clientId,
        );

        if (pending.expectedSignoffs.length === 0) {
            // The pending value has settled
            if (pending.type === "set") {
                this.values.set(key, {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    accepted: { value: pending.value, sequenceNumber },
                    pending: undefined,
                });
            } else if (pending.type === "delete") {
                this.values.delete(key);
            }
            this.emit("accepted", key);
        }
    };

    /**
     * Create a summary for the quorum
     *
     * @returns the summary of the current state of the quorum
     * @internal
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        const content = [...this.values.entries()];
        return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     * @internal
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<[string, QuorumValue][]>(storage, snapshotFileName);
        for (const [key, value] of content) {
            this.values.set(key, value);
        }
    }

    /**
     * @internal
     */
    protected initializeLocalCore(): void { }

    /**
     * @internal
     */
    protected onDisconnect(): void {
        this.disconnectWatcher.emit("disconnect");
    }

    /**
     * Override resubmit core to avoid resubmission on reconnect.
     * TODO It's probably ok to resubmit these?
     * @internal
     */
    protected reSubmitCore(): void { }

    /**
     * Process a quorum operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        if (message.type === MessageType.Operation) {
            const op = message.contents as IQuorumOperation;

            switch (op.type) {
                case "set":
                    this.incomingOp.emit("set", op.key, op.value, op.refSeq, message.sequenceNumber, message.clientId);
                    break;

                case "delete":
                    this.incomingOp.emit("delete", op.key, op.refSeq, message.sequenceNumber, message.clientId);
                    break;

                case "accept":
                    this.incomingOp.emit("accept", op.key, op.pendingSeq, message.clientId, message.sequenceNumber);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    public applyStashedOp(): void {
        throw new Error("not implemented");
    }
}
