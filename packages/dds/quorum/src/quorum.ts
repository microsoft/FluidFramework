/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/numeric-separators-style */
/* eslint-disable unicorn/number-literal-case */

// eslint-disable-next-line unicorn/prefer-node-protocol
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
interface IAcceptedQuorumValue<T> {
    /**
     * The accepted value of the given type or undefined (typically in case of delete).
     */
    value: T | undefined;

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
interface IPendingQuorumValue<T> {
    /**
     * The pending value of the given type or undefined (typically in case of delete).
     */
    value: T | undefined;
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
type QuorumValue<T> =
    { accepted: IAcceptedQuorumValue<T>; pending: undefined; }
    | { accepted: undefined; pending: IPendingQuorumValue<T>; }
    | { accepted: IAcceptedQuorumValue<T>; pending: IPendingQuorumValue<T>; };

/**
 * Quorum operation formats
 */
interface IQuorumSetOperation<T> {
    type: "set";
    key: string;
    value: T | undefined;

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
}

type IQuorumOperation<T> = IQuorumSetOperation<T> | IQuorumAcceptOperation;

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
 * Since all connected clients must explicitly accept the new value, it is important that all connected clients
 * have the Quorum loaded, including e.g. the summarizing client.  Otherwise, those clients who have not loaded
 * the Quorum will not be responding to proposals and delay their acceptance (until they disconnect, which implicitly
 * removes them from consideration).  The easiest way to ensure all clients load the Quorum is to instantiate it
 * as part of instantiating the IRuntime for the container (containerHasInitialized if using Aqueduct).
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
export class Quorum<T = unknown> extends SharedObject<IQuorumEvents> implements IQuorum<T> {
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

    private readonly values: Map<string, QuorumValue<T>> = new Map();

    // connectionWatcher emits an event whenever we get disconnected.
    private readonly connectionWatcher: EventEmitter = new EventEmitter();

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
        super(id, runtime, attributes, "fluid_quorum_");

        this.incomingOp.on("set", this.handleIncomingSet);
        this.incomingOp.on("accept", this.handleIncomingAccept);

        this.runtime.getQuorum().on("removeMember", this.handleQuorumRemoveMember);

        this.connectionWatcher.on("disconnect", () => {
            // TODO: Consider if disconnect watching is needed for promise-based API.
        });
    }

    /**
     * {@inheritDoc IQuorum.get}
     */
    public get(key: string): T | undefined {
        return this.values.get(key)?.accepted?.value;
    }

    /**
     * {@inheritDoc IQuorum.isPending}
     */
    public isPending(key: string): boolean {
        return this.values.get(key)?.pending !== undefined;
    }

    /**
     * {@inheritDoc IQuorum.getPending}
     */
    public getPending(key: string): T | undefined {
        return this.values.get(key)?.pending?.value;
    }

    /**
     * {@inheritDoc IQuorum.set}
     */
    public set(key: string, value: T | undefined): void {
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

        const setOp: IQuorumSetOperation<T> = {
            type: "set",
            key,
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
        value: T | undefined,
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

        const newQuorumValue: QuorumValue<T> = {
            accepted,
            pending: {
                value,
                expectedSignoffs,
            },
        };

        this.values.set(key, newQuorumValue);

        this.emit("pending", key);

        if (expectedSignoffs.length === 0) {
            // Only the submitting client was connected at the time the set was sequenced.
            this.values.set(key, {
                accepted: { value, sequenceNumber: setSequenceNumber },
                pending: undefined,
            });
            this.emit("accepted", key);
        } else if (this.runtime.clientId !== undefined && expectedSignoffs.includes(this.runtime.clientId)) {
            // Emit an accept upon a new key entering pending state if our accept is expected.
            const acceptOp: IQuorumAcceptOperation = {
                type: "accept",
                key,
            };
            this.submitLocalMessage(acceptOp);
        }
    };

    private readonly handleIncomingAccept = (
        key: string,
        clientId: string,
        sequenceNumber: number,
    ): void => {
        const pending = this.values.get(key)?.pending;
        // We don't resubmit accepts on reconnect so this should only run for expected accepts.
        assert(pending !== undefined, 0x2f8 /* Unexpected accept op, nothing pending */);
        assert(
            pending.expectedSignoffs.includes(clientId),
            0x2f9 /* Unexpected accept op, client not in expectedSignoffs */);

        // Remove the client from the expected signoffs
        pending.expectedSignoffs = pending.expectedSignoffs.filter(
            (expectedClientId) => expectedClientId !== clientId,
        );

        if (pending.expectedSignoffs.length === 0) {
            // The pending value has settled
            this.values.set(key, {
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
        const content = await readAndParse<[string, QuorumValue<T>][]>(storage, snapshotFileName);
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
        this.connectionWatcher.emit("disconnect");
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.reSubmitCore}
     * @internal
     */
    protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
        const quorumOp = content as IQuorumOperation<T>;
        // Filter out accept messages - if we're coming back from a disconnect, our acceptance is never required
        // because we're implicitly removed from the list of expected accepts.
        if (quorumOp.type === "accept") {
            return;
        }

        // Filter out set messages that have no chance of being accepted because there's another value pending
        // or another value was accepted while we were disconnected.
        const currentValue = this.values.get(quorumOp.key);
        if (
            currentValue !== undefined
            && (
                currentValue.pending !== undefined
                || quorumOp.refSeq < currentValue.accepted?.sequenceNumber
            )
        ) {
            // TODO: If set() returns a promise we will need to resolve it false for invalid proposals.
            return;
        }

        // Otherwise we can resubmit
        this.submitLocalMessage(quorumOp, localOpMetadata);
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
            const op = message.contents as IQuorumOperation<T>;

            switch (op.type) {
                case "set":
                    this.incomingOp.emit("set", op.key, op.value, op.refSeq, message.sequenceNumber, message.clientId);
                    break;

                case "accept":
                    this.incomingOp.emit("accept", op.key, message.clientId, message.sequenceNumber);
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
