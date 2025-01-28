/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { IEvent, IEventProvider, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { IClient, IQuorumClients, ISequencedClient } from "@fluidframework/driver-definitions";
import {
	ITelemetryLoggerExt,
	UsageError,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { summarizerClientType } from "./summarizerClientElection.js";

// helper types for recursive readonly.
// eslint-disable-next-line @typescript-eslint/ban-types
export type ImmutablePrimitives = undefined | null | boolean | string | number | Function;
export type Immutable<T> = T extends ImmutablePrimitives
	? T
	: T extends (infer A)[]
		? readonly Immutable<A>[]
		: T extends Map<infer K, infer V>
			? ReadonlyMap<Immutable<K>, Immutable<V>>
			: T extends Set<infer V>
				? ReadonlySet<Immutable<V>>
				: { readonly [K in keyof T]: Immutable<T[K]> };

/**
 * Minimum information for a client tracked for election consideration.
 */
export interface ITrackedClient {
	readonly clientId: string;
	readonly sequenceNumber: number;
	readonly client: Immutable<IClient>;
}

/**
 * Common contract for link nodes within an OrderedClientCollection.
 */
export interface ILinkNode {
	readonly sequenceNumber: number;
	youngerClient: ILinkedClient | undefined;
}

/**
 * Placeholder root node within an OrderedClientCollection; does not represent a client.
 */
export interface IRootLinkNode extends ILinkNode {
	readonly sequenceNumber: -1;
	readonly olderClient: undefined;
}

/**
 * Additional information required to keep track of the client within the doubly-linked list.
 */
export interface ILinkedClient extends ILinkNode, ITrackedClient {
	olderClient: LinkNode;
}

/**
 * Any link node within OrderedClientCollection including the placeholder root node.
 */
export type LinkNode = IRootLinkNode | ILinkedClient;

/**
 * Events raised by an OrderedClientCollection.
 */
export interface IOrderedClientCollectionEvents extends IEvent {
	/**
	 * Event fires when client is being added.
	 */
	(
		event: "addClient" | "removeClient",
		listener: (client: ILinkedClient, sequenceNumber: number) => void,
	);
}

/**
 * Contract for a sorted collection of all clients in the quorum.
 */
export interface IOrderedClientCollection
	extends IEventProvider<IOrderedClientCollectionEvents> {
	/**
	 * Count of clients in the collection.
	 */
	readonly count: number;
	/**
	 * Pointer to the oldest client in the collection.
	 */
	readonly oldestClient: ILinkedClient | undefined;
	/**
	 * Returns a sorted array of all the clients in the collection.
	 */
	getAllClients(): ILinkedClient[];
}

/**
 * Tracks clients in the Quorum. It maintains their order using their join op
 * sequence numbers.
 * Internally, the collection of clients is maintained in a doubly-linked list,
 * with pointers to both the first and last nodes.
 * The first (root) node is a placeholder to simplify logic and reduce null checking.
 */
export class OrderedClientCollection
	extends TypedEventEmitter<IOrderedClientCollectionEvents>
	implements IOrderedClientCollection
{
	/**
	 * Collection of ALL clients currently in the quorum, with client ids as keys.
	 */
	private readonly clientMap = new Map<string, ILinkedClient>();
	/**
	 * Placeholder head node of linked list, for simplified null checking.
	 */
	private readonly rootNode: IRootLinkNode = {
		sequenceNumber: -1,
		olderClient: undefined,
		youngerClient: undefined,
	};
	/**
	 * Pointer to end of linked list, for optimized client adds.
	 */
	private _youngestClient: LinkNode = this.rootNode;
	private readonly logger: ITelemetryLoggerExt;

	public get count(): number {
		return this.clientMap.size;
	}
	public get oldestClient(): ILinkedClient | undefined {
		return this.rootNode.youngerClient;
	}

	constructor(
		logger: ITelemetryBaseLogger,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
		quorum: Pick<IQuorumClients, "getMembers" | "on">,
	) {
		super();
		this.logger = createChildLogger({ logger, namespace: "OrderedClientCollection" });
		const members = quorum.getMembers();
		for (const [clientId, client] of members) {
			this.addClient(clientId, client);
		}

		quorum.on("addMember", (clientId, client) => {
			const newClient = this.addClient(clientId, client);
			this.emit("addClient", newClient, deltaManager.lastSequenceNumber);
		});
		quorum.on("removeMember", (clientId) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;
			const removeClient = this.removeClient(clientId);
			if (removeClient === undefined) {
				this.logger.sendErrorEvent({
					eventName: "ClientNotFound",
					clientId,
					sequenceNumber,
				});
			} else {
				this.emit("removeClient", removeClient, sequenceNumber);
			}
		});
	}

	private addClient(clientId: string, client: ISequencedClient): ITrackedClient {
		// Normal case is adding the latest client, which will bypass loop.
		// Find where it belongs otherwise (maybe possible during initial load?).
		assert(
			client.sequenceNumber > -1,
			0x1f6 /* "Negative client sequence number not allowed" */,
		);
		let currClient = this._youngestClient;
		while (currClient.sequenceNumber > client.sequenceNumber) {
			assert(
				currClient.olderClient !== undefined,
				0x1f7 /* "Previous client should always be defined" */,
			);
			// Note: If adding a client older than the elected client, it will not be automatically elected.
			currClient = currClient.olderClient;
		}

		// Now currClient is the node right before where the new client node should be.
		const newClient: ILinkedClient = {
			clientId,
			sequenceNumber: client.sequenceNumber,
			client: { ...client.client }, // shallow clone
			olderClient: currClient,
			youngerClient: currClient.youngerClient,
		};

		// Update prev node to point to this new node.
		newClient.olderClient.youngerClient = newClient;

		if (newClient.youngerClient === undefined) {
			// Update linked list end pointer to youngest client.
			this._youngestClient = newClient;
		} else {
			// Update next node to point back to this new node.
			newClient.youngerClient.olderClient = newClient;
		}

		this.clientMap.set(clientId, newClient);
		return newClient;
	}

	private removeClient(clientId: string): ITrackedClient | undefined {
		const removeClient = this.clientMap.get(clientId);
		if (removeClient === undefined) {
			return;
		}

		// Update prev node to point to next node.
		removeClient.olderClient.youngerClient = removeClient.youngerClient;

		if (removeClient.youngerClient === undefined) {
			// Update linked list end pointer to youngest client.
			this._youngestClient = removeClient.olderClient;
		} else {
			// Update next node to point back to previous node.
			removeClient.youngerClient.olderClient = removeClient.olderClient;
		}

		this.clientMap.delete(clientId);
		return removeClient;
	}

	/**
	 * Returns an array of all clients being tracked in order from oldest to newest.
	 */
	public getAllClients(): ILinkedClient[] {
		const result: ILinkedClient[] = [];
		let currClient: LinkNode = this.rootNode;
		while (currClient.youngerClient !== undefined) {
			result.push(currClient.youngerClient);
			currClient = currClient.youngerClient;
		}
		return result;
	}
}

/**
 * Events raised by an OrderedClientElection.
 */
export interface IOrderedClientElectionEvents extends IEvent {
	/**
	 * Event fires when the currently elected client changes.
	 */
	(
		event: "election",
		listener: (
			/**
			 * Newly elected client.
			 */
			client: ITrackedClient | undefined,
			/**
			 * Sequence number where election took place.
			 */
			sequenceNumber: number,
			/**
			 * Previously elected client.
			 */
			prevClient: ITrackedClient | undefined,
		) => void,
	);
}

/**
 * Serialized state of IOrderedClientElection.
 * @legacy
 * @alpha
 * @deprecated This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export interface ISerializedElection {
	/**
	 * Sequence number at the time of the latest election.
	 */
	readonly electionSequenceNumber: number;

	/**
	 * Most recently elected client id. This is either:
	 *
	 * 1. the interactive elected parent client, in which case electedClientId === electedParentId,
	 * and the SummaryManager on the elected client will spawn a summarizer client, or
	 *
	 * 2. the non-interactive summarizer client itself.
	 */
	readonly electedClientId: string | undefined;

	/**
	 * Most recently elected parent client id. This is always an interactive client.
	 */
	readonly electedParentId: string | undefined;
}

/**
 * Contract for maintaining a deterministic client election based on eligibility.
 */
export interface IOrderedClientElection extends IEventProvider<IOrderedClientElectionEvents> {
	/**
	 * Count of eligible clients in the collection.
	 */
	readonly eligibleCount: number;

	/**
	 * Currently elected client. This is either:
	 *
	 * 1. the interactive elected parent client, in which case electedClientId === electedParentId,
	 * and the SummaryManager on the elected client will spawn a summarizer client, or
	 *
	 * 2. the non-interactive summarizer client itself.
	 */
	readonly electedClient: ITrackedClient | undefined;
	/**
	 * Currently elected parent client. This is always an interactive client.
	 */
	readonly electedParent: ITrackedClient | undefined;
	/**
	 * Sequence number of most recent election.
	 */
	readonly electionSequenceNumber: number;
	/**
	 * Resets the currently elected client back to the oldest eligible client.
	 */
	resetElectedClient(sequenceNumber: number): void;
	/**
	 * Peeks at what the next elected client would be if incrementElectedClient were called.
	 */
	peekNextElectedClient(): ITrackedClient | undefined;
	/**
	 * Returns a sorted array of all the eligible clients in the collection.
	 */
	getAllEligibleClients(): ITrackedClient[];
	/**
	 * Serialize election data
	 */
	serialize(): ISerializedElection;
}

/**
 * Adapter for OrderedClientCollection, with the purpose of deterministically maintaining
 * a currently elected client, excluding ineligible clients, in a distributed fashion.
 * This can be true as long as incrementElectedClient and resetElectedClient calls
 * are called under the same conditions for all clients.
 */
export class OrderedClientElection
	extends TypedEventEmitter<IOrderedClientElectionEvents>
	implements IOrderedClientElection
{
	private _eligibleCount: number = 0;
	private _electedClient: ILinkedClient | undefined;
	private _electedParent: ILinkedClient | undefined;
	private _electionSequenceNumber: number;

	public get eligibleCount(): number {
		return this._eligibleCount;
	}
	public get electionSequenceNumber(): number {
		return this._electionSequenceNumber;
	}

	/**
	 * OrderedClientCollection tracks electedClient and electedParent separately. This allows us to handle the case
	 * where a new interactive parent client has been elected, but the summarizer is still doing work, so
	 * a new summarizer should not yet be spawned. In this case, changing electedParent will cause SummaryManager
	 * to stop the current summarizer, but a new summarizer will not be spawned until the old summarizer client has
	 * left the quorum.
	 *
	 * Details:
	 *
	 * electedParent is the interactive client that has been elected to spawn a summarizer. It is typically the oldest
	 * eligible interactive client in the quorum. Only the electedParent is permitted to spawn a summarizer.
	 * Once elected, this client will remain the electedParent until it leaves the quorum or the summarizer that
	 * it spawned stops producing summaries, at which point a new electedParent will be chosen.
	 *
	 * electedClient is the non-interactive summarizer client if one exists. If not, then electedClient is equal to
	 * electedParent. If electedParent === electedClient, this is the signal for electedParent to spawn a new
	 * electedClient. Once a summarizer client becomes electedClient, a new summarizer will not be spawned until
	 * electedClient leaves the quorum.
	 *
	 * A typical sequence looks like this:
	 *
	 * i. Begin by electing A. electedParent === A, electedClient === A.
	 *
	 * ii. SummaryManager running on A spawns a summarizer client, A'. electedParent === A, electedClient === A'
	 *
	 * iii. A' stops producing summaries. A new parent client, B, is elected. electedParent === B, electedClient === A'
	 *
	 * iv. SummaryManager running on A detects the change to electedParent and tells the summarizer to stop, but A'
	 * is in mid-summarization. No new summarizer is spawned, as electedParent !== electedClient.
	 *
	 * v. A' completes its summary, and the summarizer and backing client are torn down.
	 *
	 * vi. A' leaves the quorum, and B takes its place as electedClient. electedParent === B, electedClient === B
	 *
	 * vii. SummaryManager running on B spawns a summarizer client, B'. electedParent === B, electedClient === B'
	 */
	public get electedClient(): ILinkedClient | undefined {
		return this._electedClient;
	}
	public get electedParent(): ILinkedClient | undefined {
		return this._electedParent;
	}

	constructor(
		private readonly logger: ITelemetryLoggerExt,
		private readonly orderedClientCollection: IOrderedClientCollection,
		/**
		 * Serialized state from summary or current sequence number at time of load if new.
		 */
		initialState: ISerializedElection | number,
		private readonly isEligibleFn: (c: ITrackedClient) => boolean,
		private readonly recordPerformanceEvents: boolean = false,
	) {
		super();
		let initialClient: ILinkedClient | undefined;
		let initialParent: ILinkedClient | undefined;
		for (const client of orderedClientCollection.getAllClients()) {
			this.addClient(client, 0);
			if (typeof initialState !== "number") {
				if (client.clientId === initialState.electedClientId) {
					initialClient = client;
					if (
						initialState.electedParentId === undefined &&
						client.client.details.type !== summarizerClientType
					) {
						// If there was no elected parent in the serialized data, use this one.
						initialParent = client;
					}
				}
				if (client.clientId === initialState.electedParentId) {
					initialParent = client;
				}
			}
		}
		orderedClientCollection.on("addClient", (client, seq) => this.addClient(client, seq));
		orderedClientCollection.on("removeClient", (client, seq) =>
			this.removeClient(client, seq),
		);

		if (typeof initialState === "number") {
			this._electionSequenceNumber = initialState;
		} else {
			// Override the initially elected client with the initial state.
			if (initialClient?.clientId !== initialState.electedClientId) {
				// Cannot find initially elected client, so elect undefined.
				this.logger.sendErrorEvent({
					eventName: "InitialElectedClientNotFound",
					electionSequenceNumber: initialState.electionSequenceNumber,
					expectedClientId: initialState.electedClientId,
					electedClientId: initialClient?.clientId,
					clientCount: orderedClientCollection.count,
				});
			} else if (initialClient !== undefined && !isEligibleFn(initialClient)) {
				// Initially elected client is ineligible, so elect next eligible client.
				initialClient = initialParent = this.findFirstEligibleParent(initialParent);
				this.logger.sendErrorEvent({
					eventName: "InitialElectedClientIneligible",
					electionSequenceNumber: initialState.electionSequenceNumber,
					expectedClientId: initialState.electedClientId,
					electedClientId: initialClient?.clientId,
				});
			}
			this._electedParent = initialParent;
			this._electedClient = initialClient;
			this._electionSequenceNumber = initialState.electionSequenceNumber;
		}
	}

	/**
	 * Tries changing the elected client, raising an event if it is different.
	 * Note that this function does no eligibility or suitability checks. If we get here, then
	 * we will set _electedClient, and we will set _electedParent if this is an interactive client.
	 */
	private tryElectingClient(
		client: ILinkedClient | undefined,
		sequenceNumber: number,
		reason: string,
	): void {
		this.sendPerformanceEvent(
			"TryElectingClient",
			client,
			sequenceNumber,
			false /* forceSend */,
			reason,
		);
		let change = false;
		const isSummarizerClient = client?.client.details.type === summarizerClientType;
		const prevClient = this._electedClient;
		if (this._electedClient !== client) {
			this.sendPerformanceEvent(
				"ClientElected",
				client,
				sequenceNumber,
				true /* forceSend */,
				reason,
			);
			// Changing the elected client. Record the sequence number and note that we have to fire an event.
			this._electionSequenceNumber = sequenceNumber;
			this._electedClient = client;
			change = true;
		}
		if (this._electedParent !== client && !isSummarizerClient) {
			this.sendPerformanceEvent(
				"InteractiveClientElected",
				client,
				sequenceNumber,
				true /* forceSend */,
				reason,
			);
			// Changing the elected parent as well.
			this._electedParent = client;
			change = true;
		}
		if (change) {
			this.emit("election", client, sequenceNumber, prevClient);
		}
	}

	private tryElectingParent(
		client: ILinkedClient | undefined,
		sequenceNumber: number,
		reason: string,
	): void {
		this.sendPerformanceEvent(
			"TryElectingParent",
			client,
			sequenceNumber,
			false /* forceSend */,
			reason,
		);
		if (this._electedParent !== client) {
			this.sendPerformanceEvent(
				"ParentElected",
				client,
				sequenceNumber,
				true /* forceSend */,
				reason,
			);
			this._electedParent = client;
			this.emit("election", this._electedClient, sequenceNumber, this._electedClient);
		}
	}

	/**
	 * Helper function to find the first eligible parent client starting with the passed in client,
	 * or undefined if none are eligible.
	 * @param client - client to start checking
	 * @returns oldest eligible client starting with passed in client or undefined if none.
	 */
	private findFirstEligibleParent(
		client: ILinkedClient | undefined,
	): ILinkedClient | undefined {
		let candidateClient = client;
		while (
			candidateClient !== undefined &&
			(!this.isEligibleFn(candidateClient) ||
				candidateClient.client.details.type === summarizerClientType)
		) {
			candidateClient = candidateClient.youngerClient;
		}
		return candidateClient;
	}

	/**
	 * Updates tracking for when a new client is added to the collection.
	 * Will automatically elect that new client if none is elected currently.
	 * @param client - client added to the collection
	 * @param sequenceNumber - sequence number when client was added
	 */
	private addClient(client: ILinkedClient, sequenceNumber: number): void {
		this.sendPerformanceEvent("AddClient", client, sequenceNumber);
		if (this.isEligibleFn(client)) {
			this._eligibleCount++;
			const newClientIsSummarizer = client.client.details.type === summarizerClientType;
			const electedClientIsSummarizer =
				this._electedClient?.client.details.type === summarizerClientType;
			// Note that we allow a summarizer client to supersede an interactive client as elected client.
			if (
				this._electedClient === undefined ||
				(!electedClientIsSummarizer && newClientIsSummarizer)
			) {
				this.tryElectingClient(client, sequenceNumber, "AddClient");
			} else if (this._electedParent === undefined && !newClientIsSummarizer) {
				// This is an odd case. If the _electedClient is set, the _electedParent should be as well.
				this.tryElectingParent(client, sequenceNumber, "AddClient");
			}
		}
	}

	/**
	 * Updates tracking for when an existing client is removed from the collection.
	 * Will automatically elect next oldest client if currently elected is removed.
	 * @param client - client removed from the collection
	 * @param sequenceNumber - sequence number when client was removed
	 */
	private removeClient(client: ILinkedClient, sequenceNumber: number): void {
		this.sendPerformanceEvent("RemoveClient", client, sequenceNumber);
		if (this.isEligibleFn(client)) {
			this._eligibleCount--;
			if (this._electedClient === client) {
				// Removing the _electedClient. There are 2 possible cases:
				if (this._electedParent !== client) {
					// 1. The _electedClient is a summarizer that we've been allowing to finish its work.
					// Let the _electedParent become the _electedClient so that it can start its own summarizer.
					if (this._electedClient.client.details.type !== summarizerClientType) {
						throw new UsageError("Elected client should be a summarizer client 1");
					}
					this.tryElectingClient(
						this._electedParent,
						sequenceNumber,
						"RemoveSummarizerClient",
					);
				} else {
					// 2. The _electedClient is an interactive client that has left the quorum.
					// Automatically shift to next oldest client.
					const nextClient =
						this.findFirstEligibleParent(this._electedParent?.youngerClient) ??
						this.findFirstEligibleParent(this.orderedClientCollection.oldestClient);
					this.tryElectingClient(nextClient, sequenceNumber, "RemoveClient");
				}
			} else if (this._electedParent === client) {
				// Removing the _electedParent (but not _electedClient).
				// Shift to the next oldest parent, but do not replace the _electedClient,
				// which is a summarizer that is still doing work.
				if (this._electedClient?.client.details.type !== summarizerClientType) {
					throw new UsageError("Elected client should be a summarizer client 2");
				}
				const nextParent =
					this.findFirstEligibleParent(this._electedParent?.youngerClient) ??
					this.findFirstEligibleParent(this.orderedClientCollection.oldestClient);
				this.tryElectingParent(nextParent, sequenceNumber, "RemoveClient");
			}
		}
	}

	public getAllEligibleClients(): ITrackedClient[] {
		return this.orderedClientCollection
			.getAllClients()
			.filter((client) => this.isEligibleFn(client));
	}

	/**
	 * (Re-)start election with the oldest client in the quorum. This is called if we need to summarize
	 * and no client has been elected.
	 */
	public resetElectedClient(sequenceNumber: number): void {
		const firstClient = this.findFirstEligibleParent(
			this.orderedClientCollection.oldestClient,
		);
		if (this._electedClient === undefined || this._electedClient === this._electedParent) {
			this.tryElectingClient(firstClient, sequenceNumber, "ResetElectedClient");
		} else {
			// The _electedClient is a summarizer and should not be replaced until it leaves the quorum.
			// Changing the _electedParent will stop the summarizer.
			this.tryElectingParent(firstClient, sequenceNumber, "ResetElectedClient");
		}
	}

	public peekNextElectedClient(): ITrackedClient | undefined {
		return (
			this.findFirstEligibleParent(this._electedParent?.youngerClient) ??
			this.findFirstEligibleParent(this.orderedClientCollection.oldestClient)
		);
	}

	public serialize(): ISerializedElection {
		return {
			electionSequenceNumber: this.electionSequenceNumber,
			electedClientId: this.electedClient?.clientId,
			electedParentId: this.electedParent?.clientId,
		};
	}

	private sendPerformanceEvent(
		eventName: string,
		client: ILinkedClient | undefined,
		sequenceNumber: number,
		forceSend: boolean = false,
		reason?: string,
	): void {
		if (this.recordPerformanceEvents || forceSend) {
			this.logger.sendPerformanceEvent({
				eventName,
				clientId: client?.clientId,
				sequenceNumber,
				electedClientId: this.electedClient?.clientId,
				electedParentId: this.electedParent?.clientId,
				isEligible: client !== undefined ? this.isEligibleFn(client) : false,
				isSummarizerClient: client?.client.details.type === summarizerClientType,
				reason,
			});
		}
	}
}
