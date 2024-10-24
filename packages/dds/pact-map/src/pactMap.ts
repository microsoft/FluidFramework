/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

import type { IAcceptedPact, IPactMap, IPactMapEvents } from "./interfaces.js";

/**
 * The accepted pact information, if any.
 */
interface IAcceptedPactInternal<T> {
	/**
	 * The accepted value of the given type or undefined (typically in case of delete).
	 */
	value: T | undefined;

	/**
	 * The sequence number when the value was accepted, which will normally coincide with one of two possibilities:
	 * - The sequence number of the "accept" op from the final client we expected signoff from
	 * - The sequence number of the ClientLeave of the final client we expected signoff from
	 *
	 * For values set in detached state, it will be 0.
	 */
	sequenceNumber: number;
}

/**
 * The pending pact information, if any.
 */
interface IPendingPact<T> {
	/**
	 * The pending value of the given type or undefined (typically in case of delete).
	 */
	value: T | undefined;
	/**
	 * The list of clientIds that we expect "accept" ops from.  Clients are also removed from this list if they
	 * disconnect without accepting.  When this list empties, the pending value transitions to accepted.
	 */
	expectedSignoffs: string[];
}

/**
 * Internal format of the values stored in the PactMap.
 */
type Pact<T> =
	| { accepted: IAcceptedPactInternal<T>; pending: undefined }
	| { accepted: undefined; pending: IPendingPact<T> }
	| { accepted: IAcceptedPactInternal<T>; pending: IPendingPact<T> };

/**
 * PactMap operation formats
 */
interface IPactMapSetOperation<T> {
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

interface IPactMapAcceptOperation {
	type: "accept";
	key: string;
}

type IPactMapOperation<T> = IPactMapSetOperation<T> | IPactMapAcceptOperation;

const snapshotFileName = "header";

/**
 * {@inheritDoc PactMap}
 */
export class PactMapClass<T = unknown>
	extends SharedObject<IPactMapEvents>
	implements IPactMap<T>
{
	private readonly values = new Map<string, Pact<T>>();

	private readonly incomingOp: EventEmitter = new EventEmitter();

	/**
	 * Constructs a new PactMap. If the object is non-local an id and service interfaces will
	 * be provided
	 *
	 * @param runtime - data store runtime the PactMap belongs to
	 * @param id - optional name of the PactMap
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_pactMap_");

		this.incomingOp.on("set", this.handleIncomingSet);
		this.incomingOp.on("accept", this.handleIncomingAccept);

		this.runtime.getQuorum().on("removeMember", this.handleQuorumRemoveMember);
	}

	/**
	 * {@inheritDoc IPactMap.get}
	 */
	public get(key: string): T | undefined {
		return this.values.get(key)?.accepted?.value;
	}

	/**
	 * {@inheritDoc IPactMap.getWithDetails}
	 */
	public getWithDetails(key: string): IAcceptedPact<T> | undefined {
		// Note: We return type `IAcceptedPact` instead of `IAcceptedPactInternal` since we may want to diverge
		// the interfaces in the future.
		const acceptedPact = this.values.get(key)?.accepted;
		if (acceptedPact === undefined) {
			return undefined;
		}
		return {
			value: acceptedPact.value,
			acceptedSequenceNumber: acceptedPact.sequenceNumber,
		};
	}

	/**
	 * {@inheritDoc IPactMap.isPending}
	 */
	public isPending(key: string): boolean {
		return this.values.get(key)?.pending !== undefined;
	}

	/**
	 * {@inheritDoc IPactMap.getPending}
	 */
	public getPending(key: string): T | undefined {
		return this.values.get(key)?.pending?.value;
	}

	/**
	 * {@inheritDoc IPactMap.set}
	 */
	public set(key: string, value: T | undefined): void {
		const currentValue = this.values.get(key);
		// Early-exit if we can't submit a valid proposal (there's already a pending proposal)
		if (currentValue?.pending !== undefined) {
			return;
		}

		// If not attached, we basically pretend we got an ack immediately.
		if (!this.isAttached()) {
			// Queueing as a microtask to permit callers to complete their callstacks before the result of the set
			// takes effect.  This more closely resembles the pattern in the attached state, where the ack will not
			// be received synchronously.
			queueMicrotask(() => {
				this.handleIncomingSet(key, value, 0 /* refSeq */, 0 /* setSequenceNumber */);
			});
			return;
		}

		const setOp: IPactMapSetOperation<T> = {
			type: "set",
			key,
			value,
			refSeq: this.deltaManager.lastSequenceNumber,
		};

		this.submitLocalMessage(setOp);
	}

	/**
	 * {@inheritDoc IPactMap.delete}
	 */
	public delete(key: string): void {
		const currentValue = this.values.get(key);
		// Early-exit if:
		if (
			// there's nothing to delete
			currentValue === undefined ||
			// if something is pending (and so our proposal won't be valid)
			currentValue.pending !== undefined ||
			// or if the accepted value is undefined which is equivalent to already being deleted
			currentValue.accepted.value === undefined
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
		return this.isAttached() ? [...this.runtime.getQuorum().getMembers().keys()] : [];
	}

	private readonly handleIncomingSet = (
		key: string,
		value: T | undefined,
		refSeq: number,
		setSequenceNumber: number,
	): void => {
		const currentValue = this.values.get(key);
		// We use a consensus-like approach here, so a proposal is valid if the value is unset or if there is no
		// pending change and it was made with knowledge of the most recently accepted value.  We'll drop invalid
		// proposals on the ground.
		const proposalValid =
			currentValue === undefined ||
			(currentValue.pending === undefined && currentValue.accepted.sequenceNumber <= refSeq);
		if (!proposalValid) {
			return;
		}

		const accepted = currentValue?.accepted;

		// We expect signoffs from all connected clients at the time the set was sequenced (including the client who
		// sent the set).
		const expectedSignoffs = this.getSignoffClients();

		const newPact: Pact<T> = {
			accepted,
			pending: {
				value,
				expectedSignoffs,
			},
		};

		this.values.set(key, newPact);

		this.emit("pending", key);

		if (expectedSignoffs.length === 0) {
			// At least the submitting client should be amongst the expectedSignoffs, but keeping this check around
			// as extra protection and in case we bring back the "submitting client implicitly accepts" optimization.
			this.values.set(key, {
				accepted: { value, sequenceNumber: setSequenceNumber },
				pending: undefined,
			});
			this.emit("accepted", key);
		} else if (
			this.runtime.clientId !== undefined &&
			expectedSignoffs.includes(this.runtime.clientId)
		) {
			// Emit an accept upon a new key entering pending state if our accept is expected.
			const acceptOp: IPactMapAcceptOperation = {
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
			0x2f9 /* Unexpected accept op, client not in expectedSignoffs */,
		);

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
					const clientLeaveSequenceNumber = this.deltaManager.lastSequenceNumber;
					this.values.set(key, {
						accepted: {
							value: pending.value,
							// The sequence number of the ClientLeave message.
							sequenceNumber: clientLeaveSequenceNumber,
						},
						pending: undefined,
					});
					this.emit("accepted", key);
				}
			}
		}
	};

	/**
	 * Create a summary for the PactMap
	 *
	 * @returns the summary of the current state of the PactMap
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const allEntries = [...this.values.entries()];
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(allEntries));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<[string, Pact<T>][]>(storage, snapshotFileName);
		for (const [key, value] of content) {
			this.values.set(key, value);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.initializeLocalCore}
	 */
	protected initializeLocalCore(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.onDisconnect}
	 */
	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.reSubmitCore}
	 */
	protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		const pactMapOp = content as IPactMapOperation<T>;
		// Filter out accept messages - if we're coming back from a disconnect, our acceptance is never required
		// because we're implicitly removed from the list of expected accepts.
		if (pactMapOp.type === "accept") {
			return;
		}

		// Filter out set messages that have no chance of being accepted because there's another value pending
		// or another value was accepted while we were disconnected.
		const currentValue = this.values.get(pactMapOp.key);
		if (
			currentValue !== undefined &&
			(currentValue.pending !== undefined ||
				pactMapOp.refSeq < currentValue.accepted?.sequenceNumber)
		) {
			return;
		}

		// Otherwise we can resubmit
		this.submitLocalMessage(pactMapOp, localOpMetadata);
	}

	/**
	 * Process a PactMap operation
	 *
	 * @param message - the message to prepare
	 * @param local - whether the message was sent by the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation) {
			const op = message.contents as IPactMapOperation<T>;

			switch (op.type) {
				case "set": {
					this.incomingOp.emit("set", op.key, op.value, op.refSeq, message.sequenceNumber);
					break;
				}

				case "accept": {
					this.incomingOp.emit("accept", op.key, message.clientId, message.sequenceNumber);
					break;
				}

				default: {
					throw new Error("Unknown operation");
				}
			}
		}
	}

	protected applyStashedOp(): void {
		throw new Error("not implemented");
	}
}
