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
// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
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
	 * Summary-progress baseline: the latest ack observed since the elected client changed,
	 * or its election sequence number. Parent-only changes preserve this value.
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
 * On load, choose the parent from quorum and restore the summary-progress baseline.
 * Keep the recorded child if it is still a summarizer in quorum.
 */
export class SummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	private _electedParentId: string | undefined;
	private _electedClientId: string | undefined;
	/** Initial/restored baseline, replaced when the elected client changes. */
	private _electionSequenceNumber: number;
	/** Latest observed ack sequence number, cleared when the elected client changes. */
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
		// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
		private readonly summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
		private readonly maxOpsSinceLastSummary: number,
		initialState: ISerializedElection | number,
	) {
		super();
		this.logger = createChildLogger({ logger, namespace: "SummarizerClientElection" });
		this._electedParentId = this.findOldestEligibleParent();

		if (typeof initialState === "number") {
			this._electionSequenceNumber = initialState;
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
			const parentId = this.findOldestEligibleParent();
			if (this.electedClientId === undefined || (isSummarizer && !electedClientIsSummarizer)) {
				this.updateElection(isSummarizer ? clientId : parentId, parentId, sequenceNumber);
			} else if (this.electedParentId === undefined && !isSummarizer) {
				this.updateElection(this.electedClientId, parentId, sequenceNumber);
			}
		});

		quorum.on("removeMember", (clientId: string) => {
			const sequenceNumber = deltaManager.lastSequenceNumber;

			if (clientId === this.electedClientId) {
				const parentId = this.findOldestEligibleParent();
				this.updateElection(parentId, parentId, sequenceNumber);
			} else if (clientId === this.electedParentId) {
				this.updateElection(
					this.electedClientId,
					this.findOldestEligibleParent(),
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
						nextElectedClientId: this.findOldestEligibleParent(),
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

	/**
	 * Keep the recorded child if it is still a summarizer in quorum.
	 * If the recorded client is interactive, elect the oldest eligible parent.
	 * If the recorded client is absent or ineligible, choose the oldest summarizer,
	 * or the parent if no summarizer exists.
	 */
	private initFromSerializedState(state: ISerializedElection): void {
		const members = this.quorum.getMembers();

		this._electedClientId = this.findSummarizerInQuorum() ?? this.electedParentId;
		if (state.electedClientId === undefined) {
			return;
		}

		const member = members.get(state.electedClientId);
		if (member === undefined) {
			this.logger.sendErrorEvent({
				eventName: "InitialElectedClientNotFound",
				electionSequenceNumber: state.electionSequenceNumber,
				expectedClientId: state.electedClientId,
				electedClientId: this.electedClientId,
				clientCount: members.size,
			});
		} else if (isClientEligible(member)) {
			// A recorded interactive client means no child was elected.
			// Do not elect another child just because it is in quorum.
			this._electedClientId =
				member.client.details.type === summarizerClientType
					? state.electedClientId
					: this.electedParentId;
		} else {
			this.logger.sendErrorEvent({
				eventName: "InitialElectedClientIneligible",
				electionSequenceNumber: state.electionSequenceNumber,
				expectedClientId: state.electedClientId,
				electedClientId: this.electedClientId,
			});
		}
	}

	/**
	 * Applies an election transition, preserving summary progress through parent-only changes.
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
			this.lastSummaryAckSeqForClient = undefined;
		}
		this._electedClientId = clientId;
		this._electedParentId = parentId;
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

	/** Selects the oldest eligible interactive parent. */
	private findOldestEligibleParent(): string | undefined {
		let nextId: string | undefined;
		let nextSeq = Number.POSITIVE_INFINITY;

		for (const [clientId, client] of this.quorum.getMembers()) {
			if (
				isClientEligible(client) &&
				client.client.details.type !== summarizerClientType &&
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
