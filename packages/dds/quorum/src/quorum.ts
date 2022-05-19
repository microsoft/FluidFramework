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
interface IAcceptedQuorumValue {
    /**
     * The accepted value.
     */
    value: any;

    /**
     * The sequence number when the value was accepted, which will normally coincide with one of three possibilities:
     * - The sequence number of the "accept" op from the final client we expected signoff from
     * - The sequence number of the ClientLeave of the final client we expected signoff from
     * - The sequence number of the "set" op, if there were no expected signoffs (i.e. only the submitting client
     *   was connected when the op was sequenced)
     *
     * For values set in detached state, it will be 0.
     */
    sequenceNumber: number;
}

/**
 * The pending change information, if any.
 */
interface IPendingQuorumValue {
    value: any;
    /**
     * The sequence number when this value went pending -- the sequence number of the "set" op.
     */
    sequenceNumber: number;
    /**
     * The list of clientIds that we expect "accept" ops from.  Clients are also removed from this list if they
     * disconnect without accepting.  When this list empties, the pending value transitions to accepted.
     * TODO: Consider using a Set locally, and serializing to array just for the snapshot
     */
    expectedSignoffs: string[];
}

/**
 * Internal format of the values stored in the Quorum.
 */
type QuorumValue =
    { accepted: IAcceptedQuorumValue; pending: undefined; }
    | { accepted: undefined; pending: IPendingQuorumValue; }
    | { accepted: IAcceptedQuorumValue; pending: IPendingQuorumValue; };

/**
 * Quorum operation formats
 */
interface IQuorumSetOperation {
    type: "set";
    key: string;
    value: any;

    /**
     * A "set" is only valid if it is made with knowledge of the most-recent accepted proposal - its reference
     * sequence number is greater than or equal to the sequence number when that prior value was accepted.
     *
     * However, we can't trust the built-in referenceSequenceNumber of the op because of resubmit on reconnect,
     * which will update the referenceSequenceNumber on our behalf.
     *
     * Instead we need to separately stamp the real reference sequence number on the op itself.
     */
    refSeq: number;
}

interface IQuorumAcceptOperation {
    type: "accept";
    key: string;
    /**
     * The sequence number when the value to be accepted went pending.  This is used to validate that we are
     * accepting the specific proposal that we intended, and not another proposal for the same key.
     * TODO: We may not need this if we filter out resubmission of "accept" ops on reconnect.
     */
    pendingSeq: number;
}

type IQuorumOperation = IQuorumSetOperation | IQuorumAcceptOperation;

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
 * cannot be resolved until other clients have witnessed the set, the new value will only be reflected in the data
 * after the consensus is reached.
 *
 * ```typescript
 * quorum.on("pending", (key: string) => {
 *     console.log(quorum.getPending(key));
 * });
 * quorum.on("accepted", (key: string) => {
 *     console.log(quorum.get(key));
 * });
 * quorum.set("myKey", "myValue");
 *
 * // Reading from the quorum prior to the async operation's completion will still return the old value.
 * console.log(quorum.get("myKey"));
 * ```
 *
 * The acceptance process has two stages.  When an op indicating a client's attempt to set a value is sequenced,
 * we first verify that it was set with knowledge of the most recently accepted value (consensus-like FWW).  If it
 * meets this bar, then the value is "pending".  During this time, clients may observe the pending value and act
 * upon it, but should be aware that not all other clients may have witnessed the value yet.  Once all clients
 * that were connected at the time of the value being set have explicitly acknowledged the new value, the value
 * becomes "accepted".  Once the value is accepted, it once again becomes possible to set the value, again with
 * consensus-like FWW resolution.
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
        this.incomingOp.on("accept", this.handleIncomingAccept);

        this.runtime.getQuorum().on("removeMember", this.handleQuorumRemoveMember);

        this.disconnectWatcher.on("disconnect", () => {
            // assert(this.runtime.clientId !== undefined, 0x1d3 /* "Missing client id on disconnect" */);
            // TODO: Handle appropriately
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
        // TODO: Should this return differently for "nothing pending" vs. "delete pending"?
        // Maybe return the QuorumValue itself?
        return this.values.get(key)?.pending?.value;
    }

    /**
     * {@inheritDoc IQuorum.set}
     */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public set(key: string, value: any): void {
        const currentValue = this.values.get(key);
        // Early-exit if we can't submit a valid proposal (there's already a pending proposal)
        if (currentValue?.pending !== undefined) {
            return;
        }

        // If not attached, we basically pretend we got an ack immediately.
        // TODO: Should we just directly store the value rather than the full simulation?
        if (!this.isAttached()) {
            // Queueing as a microtask to permit callers to complete their callstacks before the result of the set
            // takes effect.  This more closely resembles the pattern in the attached state, where the ack will not
            // be received synchronously.
            queueMicrotask(() => {
                this.handleIncomingSet(
                    key,
                    value,
                    0 /* refSeq */,
                    0 /* setSequenceNumber */,
                    "detachedClient" /* clientId */,
                );
            });
            return;
        }

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
        const currentValue = this.values.get(key);
        // Early-exit if:
        if (
            // there's nothing to delete
            currentValue === undefined
            // if something is pending (and so our proposal won't be valid)
            || currentValue.pending !== undefined
            // or if the accepted value is undefined which is equivalent to already being deleted
            || currentValue.accepted.value === undefined
        ) {
            return;
        }

        this.set(key, undefined);
    }

    /**
     * Get a point-in-time list of clients who must sign off on values coming in for them to move from "pending" to
     * "accepted" state.  This list is finalized for a value at the moment it goes pending (i.e. if more clients
     * join later, they are not added to the list of signoffs).
     * @returns The list of clientIds for clients who must sign off to accept the incoming pending value
     */
    private getSignoffClients(): string[] {
        // If detached, we don't need anyone to sign off.  Otherwise, we need all currently connected clients.
        return this.isAttached()
            ? [...this.runtime.getQuorum().getMembers().keys()]
            : [];
    }

    private readonly handleIncomingSet = (
        key: string,
        value: any,
        refSeq: number,
        setSequenceNumber: number,
        clientId: string,
    ): void => {
        const currentValue = this.values.get(key);
        // We use a consensus-like approach here, so a proposal is valid if the value is unset or if there is no
        // pending change and it was made with knowledge of the most recently accepted value.  We'll drop invalid
        // proposals on the ground.
        const proposalValid =
            currentValue === undefined
            || (currentValue.pending === undefined && currentValue.accepted.sequenceNumber <= refSeq);
        if (!proposalValid) {
            // TODO: If set() returns a promise we will need to resolve it false for invalid proposals.
            return;
        }

        const accepted = currentValue?.accepted;

        // We expect signoffs from all connected clients at the time the set was sequenced, except for the client
        // who issued the set (that client implicitly signs off).
        const expectedSignoffs = this.getSignoffClients().filter((quorumMemberId) => quorumMemberId !== clientId);

        const newQuorumValue: QuorumValue = {
            accepted,
            pending: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                value,
                sequenceNumber: setSequenceNumber,
                expectedSignoffs,
            },
        };

        this.values.set(key, newQuorumValue);

        this.emit("pending", key);

        if (expectedSignoffs.length === 0) {
            // Only the submitting client was connected at the time the set was sequenced.
            this.values.set(key, {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                accepted: { value, sequenceNumber: setSequenceNumber },
                pending: undefined,
            });
            this.emit("accepted", key);
        } else if (this.runtime.clientId !== undefined && expectedSignoffs.includes(this.runtime.clientId)) {
            // Emit an accept upon a new key entering pending state if our accept is expected.
            const acceptOp: IQuorumAcceptOperation = {
                type: "accept",
                key,
                pendingSeq: setSequenceNumber,
            };
            this.submitLocalMessage(acceptOp);
        }
    };

    private readonly handleIncomingAccept = (
        key: string,
        pendingSeq: number,
        clientId: string,
        sequenceNumber: number,
    ): void => {
        const pending = this.values.get(key)?.pending;
        if (pending === undefined
            || pending.sequenceNumber !== pendingSeq
            || !pending.expectedSignoffs.includes(clientId)) {
            // Drop unexpected accepts on the ground.  This can happen normally in resubmit on reconnect cases, and
            // is benign since the client implicitly accepts on disconnect.
            // TODO: We could filter out just the accept ops when resubmitting on reconnect to avoid this - the
            // proposals could still be resubmitted.
            return;
        }

        // Remove the client from the expected signoffs
        pending.expectedSignoffs = pending.expectedSignoffs.filter(
            (expectedClientId) => expectedClientId !== clientId,
        );

        if (pending.expectedSignoffs.length === 0) {
            // The pending value has settled
            this.values.set(key, {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                accepted: { value: pending.value, sequenceNumber },
                pending: undefined,
            });
            this.emit("accepted", key);
        }
    };

    private readonly handleQuorumRemoveMember = (clientId: string): void => {
        for (const [key, { pending }] of this.values) {
            if (pending !== undefined) {
                pending.expectedSignoffs = pending.expectedSignoffs.filter(
                    (expectedClientId) => expectedClientId !== clientId,
                );

                if (pending.expectedSignoffs.length === 0) {
                    // The pending value has settled
                    this.values.set(key, {
                        accepted: {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            value: pending.value,
                            // The sequence number of the ClientLeave message.
                            sequenceNumber: this.runtime.deltaManager.lastSequenceNumber,
                        },
                        pending: undefined,
                    });
                    this.emit("accepted", key);
                }
            }
        }
    };

    /**
     * Create a summary for the quorum
     *
     * @returns the summary of the current state of the quorum
     * @internal
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        const allEntries = [...this.values.entries()];
        // Filter out items that are ineffectual
        const summaryEntries = allEntries.filter(([, quorumValue]) => {
            return (
                // Items have an effect if they are still pending, have a real value, or some client may try to
                // reference state before the value was accepted.  Otherwise they can be dropped.
                quorumValue.pending !== undefined
                || quorumValue.accepted.value !== undefined
                || quorumValue.accepted.sequenceNumber > this.runtime.deltaManager.minimumSequenceNumber
            );
        });
        return createSingleBlobSummary(snapshotFileName, JSON.stringify(summaryEntries));
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
