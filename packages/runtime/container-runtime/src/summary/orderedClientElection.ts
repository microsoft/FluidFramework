/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import type {
	IClient,
	IQuorumClients,
	ISequencedClient,
} from "@fluidframework/driver-definitions";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { summarizerClientType } from "./summarizerTypes.js";

// helper types for recursive readonly.
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @rushstack/no-new-null
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
 * @internal
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

function isSummarizerClient(client: ITrackedClient): boolean {
	return client.client.details.type === summarizerClientType;
}

function toTrackedClient(clientId: string, client: ISequencedClient): ITrackedClient {
	return {
		clientId,
		sequenceNumber: client.sequenceNumber,
		client: client.client as Immutable<IClient>,
	};
}

/**
 * Deterministically maintains a currently elected client by reading quorum members directly,
 * excluding ineligible clients. Observes quorum membership events to detect when clients join
 * or leave, enabling the graceful handoff protocol.
 *
 * This class tracks electedClient and electedParent separately. This allows us to handle the case
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
export class OrderedClientElection
	extends TypedEventEmitter<IOrderedClientElectionEvents>
	implements IOrderedClientElection
{
	private _electedClient: ITrackedClient | undefined;
	private _electedParent: ITrackedClient | undefined;
	private _electionSequenceNumber: number;

	public get eligibleCount(): number {
		return this.getAllEligibleClients().length;
	}
	public get electionSequenceNumber(): number {
		return this._electionSequenceNumber;
	}
	public get electedClient(): ITrackedClient | undefined {
		return this._electedClient;
	}
	public get electedParent(): ITrackedClient | undefined {
		return this._electedParent;
	}

	constructor(
		private readonly logger: ITelemetryLoggerExt,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
		private readonly quorum: Pick<IQuorumClients, "getMembers" | "on">,
		/**
		 * Serialized state from summary or current sequence number at time of load if new.
		 */
		initialState: ISerializedElection | number,
		private readonly isEligibleFn: (c: ITrackedClient) => boolean,
		private readonly recordPerformanceEvents: boolean = false,
	) {
		super();

		if (typeof initialState === "number") {
			this._electionSequenceNumber = initialState;
			this._electedParent = this.findOldestEligibleParent();
			this._electedClient = this._electedParent;
			// Check if a summarizer is already in quorum and should supersede
			const summarizer = this.findSummarizerInQuorum();
			if (summarizer !== undefined && this._electedClient !== undefined) {
				this._electedClient = summarizer;
			}
		} else {
			this._electionSequenceNumber = initialState.electionSequenceNumber;
			const members = quorum.getMembers();

			// Try to restore the elected parent
			let initialParent: ITrackedClient | undefined;
			if (initialState.electedParentId !== undefined) {
				const member = members.get(initialState.electedParentId);
				if (member !== undefined) {
					const tracked = toTrackedClient(initialState.electedParentId, member);
					if (this.isEligibleFn(tracked)) {
						initialParent = tracked;
					}
				}
			}

			// Try to restore the elected client
			let initialClient: ITrackedClient | undefined;
			if (initialState.electedClientId !== undefined) {
				const member = members.get(initialState.electedClientId);
				if (member === undefined) {
					// Cannot find initially elected client, so elect undefined.
					this.logger.sendErrorEvent({
						eventName: "InitialElectedClientNotFound",
						electionSequenceNumber: initialState.electionSequenceNumber,
						expectedClientId: initialState.electedClientId,
						electedClientId: undefined,
						clientCount: members.size,
					});
				} else {
					const tracked = toTrackedClient(initialState.electedClientId, member);
					if (this.isEligibleFn(tracked)) {
						initialClient = tracked;
					} else {
						// Initially elected client is ineligible — elect next eligible after it.
						const fallback = this.findNextEligibleParentAfter(tracked.sequenceNumber);
						initialClient = fallback;
						initialParent = fallback;
						this.logger.sendErrorEvent({
							eventName: "InitialElectedClientIneligible",
							electionSequenceNumber: initialState.electionSequenceNumber,
							expectedClientId: initialState.electedClientId,
							electedClientId: initialClient?.clientId,
						});
					}
				}
			}

			// If no parent was found but we have an interactive client, use it
			if (
				initialParent === undefined &&
				initialClient !== undefined &&
				initialClient.client.details.type !== summarizerClientType
			) {
				initialParent = initialClient;
			}

			this._electedParent = initialParent;
			this._electedClient = initialClient;
		}

		quorum.on("addMember", (clientId: string, client: ISequencedClient) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;
			const tracked = toTrackedClient(clientId, client);
			if (!this.isEligibleFn(tracked)) {
				return;
			}

			const isSummarizer = client.client.details.type === summarizerClientType;
			const electedIsSummarizer =
				this._electedClient !== undefined && isSummarizerClient(this._electedClient);

			if (this._electedClient === undefined || (!electedIsSummarizer && isSummarizer)) {
				// Elect this client: either no one is elected, or a summarizer supersedes an interactive client.
				this.tryElectingClient(tracked, sequenceNumber, "AddClient");
			} else if (this._electedParent === undefined && !isSummarizer) {
				// This is an odd case. If the _electedClient is set, the _electedParent should be as well.
				this.tryElectingParent(tracked, sequenceNumber, "AddClient");
			}
		});

		quorum.on("removeMember", (clientId: string) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;

			// Removing the _electedClient. There are 2 possible cases:
			if (this._electedClient?.clientId === clientId) {
				if (this._electedParent?.clientId === clientId) {
					// 1. The _electedClient is an interactive client that has left the quorum.
					// Automatically shift to next oldest client.
					const nextClient = this.findOldestEligibleParent();
					this.tryElectingClient(nextClient, sequenceNumber, "RemoveClient");
				} else {
					// 2. The _electedClient is a summarizer that we've been allowing to finish its work.
					// Let the _electedParent become the _electedClient so that it can start its own summarizer.
					this.tryElectingClient(
						this._electedParent,
						sequenceNumber,
						"RemoveSummarizerClient",
					);
				}
			} else if (this._electedParent?.clientId === clientId) {
				// Removing the _electedParent (but not _electedClient).
				// Shift to the next oldest parent, but do not replace the _electedClient,
				// which is a summarizer that is still doing work.
				const nextParent = this.findOldestEligibleParent();
				this.tryElectingParent(nextParent, sequenceNumber, "RemoveClient");
			}
		});
	}

	/**
	 * Tries changing the elected client, raising an event if it is different.
	 * Note that this function does no eligibility or suitability checks. If we get here, then
	 * we will set _electedClient, and we will set _electedParent if this is an interactive client.
	 */
	private tryElectingClient(
		client: ITrackedClient | undefined,
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
		const isSummarizer = client !== undefined && isSummarizerClient(client);
		const prevClient = this._electedClient;
		if (this._electedClient?.clientId !== client?.clientId) {
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
		if (this._electedParent?.clientId !== client?.clientId && !isSummarizer) {
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
		client: ITrackedClient | undefined,
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
		if (this._electedParent?.clientId !== client?.clientId) {
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
	 * Find the oldest eligible interactive (non-summarizer) client in the quorum.
	 */
	private findOldestEligibleParent(): ITrackedClient | undefined {
		let oldest: ITrackedClient | undefined;
		for (const [clientId, client] of this.quorum.getMembers()) {
			const tracked = toTrackedClient(clientId, client);
			if (
				this.isEligibleFn(tracked) &&
				client.client.details.type !== summarizerClientType &&
				(oldest === undefined || client.sequenceNumber < oldest.sequenceNumber)
			) {
				oldest = tracked;
			}
		}
		return oldest;
	}

	/**
	 * Find the next eligible interactive client after the given sequence number.
	 * Returns undefined if no eligible client is found with a higher sequence number.
	 */
	private findNextEligibleParentAfter(sequenceNumber: number): ITrackedClient | undefined {
		let nextOldest: ITrackedClient | undefined;
		for (const [clientId, client] of this.quorum.getMembers()) {
			const tracked = toTrackedClient(clientId, client);
			if (
				this.isEligibleFn(tracked) &&
				client.client.details.type !== summarizerClientType &&
				client.sequenceNumber > sequenceNumber &&
				(nextOldest === undefined || client.sequenceNumber < nextOldest.sequenceNumber)
			) {
				nextOldest = tracked;
			}
		}
		return nextOldest;
	}

	/**
	 * Find any summarizer-type client currently in the quorum.
	 */
	private findSummarizerInQuorum(): ITrackedClient | undefined {
		for (const [clientId, client] of this.quorum.getMembers()) {
			if (client.client.details.type === summarizerClientType) {
				const tracked = toTrackedClient(clientId, client);
				if (this.isEligibleFn(tracked)) {
					return tracked;
				}
			}
		}
		return undefined;
	}

	/**
	 * (Re-)start election with the oldest client in the quorum. This is called if we need to summarize
	 * and no client has been elected.
	 */
	public resetElectedClient(sequenceNumber: number): void {
		const firstClient = this.findOldestEligibleParent();
		if (this._electedClient === undefined || this._electedClient === this._electedParent) {
			this.tryElectingClient(firstClient, sequenceNumber, "ResetElectedClient");
		} else {
			// The _electedClient is a summarizer and should not be replaced until it leaves the quorum.
			// Changing the _electedParent will stop the summarizer.
			this.tryElectingParent(firstClient, sequenceNumber, "ResetElectedClient");
		}
	}

	public peekNextElectedClient(): ITrackedClient | undefined {
		// Find the next oldest eligible parent after the current one
		const currentParentSeq = this._electedParent?.sequenceNumber ?? -1;
		let nextOldest: ITrackedClient | undefined;
		for (const [clientId, client] of this.quorum.getMembers()) {
			const tracked = toTrackedClient(clientId, client);
			if (
				this.isEligibleFn(tracked) &&
				client.client.details.type !== summarizerClientType &&
				client.sequenceNumber > currentParentSeq &&
				(nextOldest === undefined || client.sequenceNumber < nextOldest.sequenceNumber)
			) {
				nextOldest = tracked;
			}
		}
		// If no younger client found, wrap around to oldest
		return nextOldest ?? this.findOldestEligibleParent();
	}

	public getAllEligibleClients(): ITrackedClient[] {
		const result: ITrackedClient[] = [];
		for (const [clientId, client] of this.quorum.getMembers()) {
			const tracked = toTrackedClient(clientId, client);
			if (this.isEligibleFn(tracked)) {
				result.push(tracked);
			}
		}
		return result.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
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
		client: ITrackedClient | undefined,
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
				isEligible: client === undefined ? false : this.isEligibleFn(client),
				isSummarizerClient: client?.client.details.type === summarizerClientType,
				reason,
			});
		}
	}
}
