/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type {
	IEvent,
	IEventProvider,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IClient,
	IClientDetails,
	IQuorumClients,
	ISequencedClient,
} from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { summarizerClientType } from "./summarizerTypes.js";
import type { ISummaryCollectionOpEvents } from "./summaryCollection.js";

function isClientEligible(client: ISequencedClient): boolean {
	const details: IClient["details"] | undefined = client.client.details;
	return (
		details === undefined || SummarizerClientElection.clientDetailsPermitElection(details)
	);
}

/**
 * Serialized state of the summarizer election.
 * @internal
 */
export interface ISerializedElection {
	/**
	 * Latest observed summary ack sequence number, or the election's starting sequence number if no ack has been observed.
	 * @remarks The historical field name is retained for snapshot compatibility; the value tracks summary progress.
	 */
	readonly electionSequenceNumber: number;

	/** Elected parent or incumbent summarizer child. */
	readonly electedClientId: string | undefined;

	/** Interactive client responsible for creating the summarizer. */
	readonly electedParentId: string | undefined;
}

export interface ISummarizerClientElectionEvents extends IEvent {
	(event: "electedSummarizerChanged", handler: () => void): void;
}

export interface ISummarizerClientElection
	extends IEventProvider<ISummarizerClientElectionEvents> {
	readonly electedClientId: string | undefined;
	readonly electedParentId: string | undefined;
}

/**
 * Tracks the parent responsible for creating a summarizer and the elected client.
 * The elected client is either that parent or an incumbent summarizer child.
 *
 * Parent succession retains the incumbent child until its quorum departure.
 * When electedClientId === electedParentId, the parent may create a new child.
 *
 * Fresh elections choose the oldest eligible parent; restored elections retain
 * valid recorded identities. Summary progress is monitored through op telemetry.
 */
export class SummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	private _electedParentId: string | undefined;
	/** Join sequence number of the elected parent, used for wrap-around election. */
	private _electedParentSeq: number | undefined;
	private _electedClientId: string | undefined;
	private _electionSequenceNumber: number;
	/** Latest observed ack sequence number, cleared when either election identity changes. */
	private lastSummaryAckSeqForClient: number | undefined;
	/** Sequence number of the last warning, used to rate-limit progress telemetry. */
	private lastReportedSeq = 0;

	private readonly logger: TelemetryLoggerExt;

	public get electedClientId(): string | undefined {
		return this._electedClientId;
	}

	public get electedParentId(): string | undefined {
		return this._electedParentId;
	}

	constructor(
		logger: ITelemetryBaseLogger,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
		private readonly quorum: Pick<IQuorumClients, "getMembers" | "getMember" | "on">,
		private readonly summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
		private readonly maxOpsSinceLastSummary: number,
		initialState: ISerializedElection | number,
	) {
		super();
		this.logger = createChildLogger({ logger, namespace: "SummarizerClientElection" });

		if (typeof initialState === "number") {
			this._electionSequenceNumber = initialState;
			this.setElectedParent(this.findOldestEligibleParent());
			this._electedClientId = this.findSummarizerInQuorum() ?? this._electedParentId;
		} else {
			this._electionSequenceNumber = initialState.electionSequenceNumber;
			this.initFromSerializedState(initialState);
		}
		quorum.on("addMember", (clientId: string, client: ISequencedClient) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;
			if (!isClientEligible(client)) {
				return;
			}
			const isSummarizer = client.client.details.type === summarizerClientType;
			const electedClientIsSummarizer =
				this.electedClientId !== undefined &&
				this.quorum.getMember(this.electedClientId)?.client.details?.type ===
					summarizerClientType;
			if (this.electedClientId === undefined || (isSummarizer && !electedClientIsSummarizer)) {
				this.updateElection(
					clientId,
					isSummarizer ? this.electedParentId : clientId,
					sequenceNumber,
				);
			} else if (this.electedParentId === undefined && !isSummarizer) {
				this.updateElection(this.electedClientId, clientId, sequenceNumber);
			}
		});

		quorum.on("removeMember", (clientId: string) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;

			if (clientId === this.electedClientId) {
				const parentId =
					clientId === this.electedParentId
						? this.findNextEligibleParent()
						: this.electedParentId;
				this.updateElection(parentId, parentId, sequenceNumber);
			} else if (clientId === this.electedParentId) {
				this.updateElection(
					this.electedClientId,
					this.findNextEligibleParent(),
					sequenceNumber,
				);
			}
		});

		// Recover an absent election; otherwise monitor summary progress.
		this.summaryCollection.on("default", ({ sequenceNumber }) => {
			if (this.electedClientId === undefined) {
				this.resetElectedClient(sequenceNumber);
				return;
			}

			const baseline = this.lastSummaryAckSeqForClient ?? this._electionSequenceNumber;
			const opsWithoutSummary = sequenceNumber - baseline;
			if (opsWithoutSummary > this.maxOpsSinceLastSummary) {
				const opsSinceLastReport = sequenceNumber - this.lastReportedSeq;
				if (opsSinceLastReport > this.maxOpsSinceLastSummary) {
					this.logger.sendTelemetryEvent({
						eventName: "ElectedClientNotSummarizing",
						electedClientId: this.electedClientId,
						lastSummaryAckSeqForClient: this.lastSummaryAckSeqForClient,
						electionSequenceNumber: this._electionSequenceNumber,
						nextElectedClientId: this.findNextEligibleParent(),
						opsWithoutSummary,
					});
					this.lastReportedSeq = sequenceNumber;
				}
			}
		});

		this.summaryCollection.on(MessageType.SummaryAck, (op) => {
			this.lastSummaryAckSeqForClient = op.sequenceNumber;
		});
	}

	/** Restores recorded identities that are still eligible quorum members. */
	private initFromSerializedState(state: ISerializedElection): void {
		const members = this.quorum.getMembers();

		if (state.electedParentId !== undefined) {
			const parentMember = members.get(state.electedParentId);
			if (parentMember !== undefined && isClientEligible(parentMember)) {
				this.setElectedParent(state.electedParentId);
			}
		}

		if (state.electedClientId === undefined) {
			// Preserve an absent election until the op handler recovers it.
			return;
		}

		const member = members.get(state.electedClientId);
		if (member === undefined) {
			// Leave the elected client undefined so the next op can recover from quorum.
			this.logger.sendErrorEvent({
				eventName: "InitialElectedClientNotFound",
				electionSequenceNumber: state.electionSequenceNumber,
				expectedClientId: state.electedClientId,
				electedClientId: undefined,
				clientCount: members.size,
			});
		} else if (isClientEligible(member)) {
			this._electedClientId = state.electedClientId;
			if (
				this.electedParentId === undefined &&
				member.client.details.type !== summarizerClientType
			) {
				this.setElectedParent(state.electedClientId);
			}
		} else {
			// Advance past an ineligible recorded client by join sequence.
			const fallbackId = this.findNextEligibleParentAfter(member.sequenceNumber);
			this.logger.sendErrorEvent({
				eventName: "InitialElectedClientIneligible",
				electionSequenceNumber: state.electionSequenceNumber,
				expectedClientId: state.electedClientId,
				electedClientId: fallbackId,
			});
			this.setElectedParent(fallbackId);
			this._electedClientId = fallbackId;
		}
	}

	/**
	 * Applies an election transition while preserving the elected-client sequence baseline.
	 * Parent-only changes reset the summary-ack baseline without changing that sequence number.
	 */
	private updateElection(
		clientId: string | undefined,
		parentId: string | undefined,
		sequenceNumber: number,
	): void {
		if (clientId === this.electedClientId && parentId === this.electedParentId) {
			return;
		}
		const previousElectedClientId = this.electedClientId;
		const previousElectedParentId = this.electedParentId;
		if (clientId !== this.electedClientId) {
			this._electionSequenceNumber = sequenceNumber;
		}
		this._electedClientId = clientId;
		this.setElectedParent(parentId);
		this.lastSummaryAckSeqForClient = undefined;
		this.logger.sendTelemetryEvent({
			eventName: "ElectionChanged",
			previousElectedClientId,
			previousElectedParentId,
			electedClientId: this.electedClientId,
			electedParentId: this.electedParentId,
			sequenceNumber,
		});
		if (clientId === undefined) {
			this.resetElectedClient(sequenceNumber);
		}
		this.emit("electedSummarizerChanged");
	}

	/**
	 * Resets the parent to the oldest eligible interactive client, retaining an elected summarizer.
	 */
	public resetElectedClient(sequenceNumber: number): void {
		const parentId = this.findOldestEligibleParent();
		this.updateElection(
			this.electedClientId === undefined || this.electedClientId === this.electedParentId
				? parentId
				: this.electedClientId,
			parentId,
			sequenceNumber,
		);
	}

	/** Retains the parent's join sequence for succession after its quorum departure. */
	private setElectedParent(clientId: string | undefined): void {
		this._electedParentId = clientId;
		if (clientId === undefined) {
			this._electedParentSeq = undefined;
		} else {
			const member = this.quorum.getMembers().get(clientId);
			this._electedParentSeq = member?.sequenceNumber;
		}
	}

	/** Selects the oldest eligible interactive parent. */
	private findOldestEligibleParent(): string | undefined {
		return this.findNextEligibleParentAfter(-1);
	}

	/** Selects the next-younger eligible parent, wrapping to the oldest. */
	private findNextEligibleParent(): string | undefined {
		const currentParentSeq = this._electedParentSeq ?? -1;
		return (
			this.findNextEligibleParentAfter(currentParentSeq) ?? this.findOldestEligibleParent()
		);
	}

	/** Selects the oldest eligible interactive parent with a higher join sequence. */
	private findNextEligibleParentAfter(sequenceNumber: number): string | undefined {
		let nextId: string | undefined;
		let nextSeq = Number.POSITIVE_INFINITY;

		for (const [clientId, client] of this.quorum.getMembers()) {
			if (
				isClientEligible(client) &&
				client.client.details.type !== summarizerClientType &&
				client.sequenceNumber > sequenceNumber &&
				client.sequenceNumber < nextSeq
			) {
				nextId = clientId;
				nextSeq = client.sequenceNumber;
			}
		}
		return nextId;
	}

	/** Selects the oldest summarizer client in quorum. */
	private findSummarizerInQuorum(): string | undefined {
		let oldestId: string | undefined;
		let oldestSequenceNumber = Number.POSITIVE_INFINITY;
		for (const [clientId, client] of this.quorum.getMembers()) {
			if (
				client.client.details.type === summarizerClientType &&
				client.sequenceNumber < oldestSequenceNumber
			) {
				oldestId = clientId;
				oldestSequenceNumber = client.sequenceNumber;
			}
		}
		return oldestId;
	}

	public serialize(): ISerializedElection {
		return {
			electionSequenceNumber: this.lastSummaryAckSeqForClient ?? this._electionSequenceNumber,
			electedClientId: this.electedClientId,
			electedParentId: this._electedParentId,
		};
	}

	public static readonly clientDetailsPermitElection = (details: IClientDetails): boolean =>
		details.capabilities.interactive || details.type === summarizerClientType;
}
