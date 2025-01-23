/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import { IClientDetails } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import {
	IOrderedClientElection,
	ISerializedElection,
	ITrackedClient,
} from "./orderedClientElection.js";
import { ISummaryCollectionOpEvents } from "./summaryCollection.js";

export const summarizerClientType = "summarizer";

export interface ISummarizerClientElectionEvents extends IEvent {
	(event: "electedSummarizerChanged", handler: () => void): void;
}

export interface ISummarizerClientElection
	extends IEventProvider<ISummarizerClientElectionEvents> {
	readonly electedClientId: string | undefined;
	readonly electedParentId: string | undefined;
}

/**
 * This class encapsulates logic around tracking the elected summarizer client.
 * It will handle updating the elected client when a summary ack hasn't been seen
 * for some configured number of ops.
 */
export class SummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	/**
	 * Used to calculate number of ops since last summary ack for the current elected client.
	 * This will be undefined if there is no elected summarizer, or no summary ack has been
	 * observed since this client was elected.
	 * When a summary ack comes in, this will be set to the sequence number of the summary ack.
	 */
	private lastSummaryAckSeqForClient: number | undefined;
	/**
	 * Used to prevent excess logging by recording the sequence number that we last reported at,
	 * and making sure we don't report another event to telemetry. If things work as intended,
	 * this is not needed, otherwise it could report an event on every op in worst case scenario.
	 */
	private lastReportedSeq = 0;

	public get electedClientId(): string | undefined {
		return this.clientElection.electedClient?.clientId;
	}
	public get electedParentId(): string | undefined {
		return this.clientElection.electedParent?.clientId;
	}

	constructor(
		private readonly logger: ITelemetryLoggerExt,
		private readonly summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
		public readonly clientElection: IOrderedClientElection,
		private readonly maxOpsSinceLastSummary: number,
	) {
		super();
		// On every inbound op, if enough ops pass without seeing a summary ack (per elected client),
		// elect a new client and log to telemetry.
		this.summaryCollection.on("default", ({ sequenceNumber }) => {
			const electedClientId = this.electedClientId;
			if (electedClientId === undefined) {
				// Reset election if no elected client, but eligible clients are connected.
				// This should be uncommon, but is possible if the initial state of the
				// ordered client election contains an undefined client id or one not found
				// in the quorum (the latter would already log an error).
				if (this.clientElection.eligibleCount > 0) {
					this.clientElection.resetElectedClient(sequenceNumber);
				}
				return;
			}
			const electionSequenceNumber = this.clientElection.electionSequenceNumber;
			const opsWithoutSummary =
				sequenceNumber - (this.lastSummaryAckSeqForClient ?? electionSequenceNumber);
			if (opsWithoutSummary > this.maxOpsSinceLastSummary) {
				// Log and elect a new summarizer client.
				const opsSinceLastReport = sequenceNumber - this.lastReportedSeq;
				if (opsSinceLastReport > this.maxOpsSinceLastSummary) {
					this.logger.sendTelemetryEvent({
						eventName: "ElectedClientNotSummarizing",
						electedClientId,
						lastSummaryAckSeqForClient: this.lastSummaryAckSeqForClient,
						electionSequenceNumber,
						nextElectedClientId: this.clientElection.peekNextElectedClient()?.clientId,
					});
					this.lastReportedSeq = sequenceNumber;
				}
			}
		});

		// When a summary ack comes in, reset our op seq counter.
		this.summaryCollection.on(MessageType.SummaryAck, (op) => {
			this.lastSummaryAckSeqForClient = op.sequenceNumber;
		});

		// Use oldest client election for unanimously and deterministically deciding
		// which client should summarize.
		this.clientElection.on("election", (client, sequenceNumber) => {
			this.lastSummaryAckSeqForClient = undefined;
			if (client === undefined && this.clientElection.eligibleCount > 0) {
				// If no client is valid for election, reset to the oldest again.
				// Also make extra sure not to get stuck in an infinite loop here:
				// If there are no eligible clients, just wait until a client joins
				// and will be auto-elected.
				this.clientElection.resetElectedClient(sequenceNumber);
			}
			// Election can trigger a change in SummaryManager state.
			this.emit("electedSummarizerChanged");
		});
	}

	public serialize(): ISerializedElection {
		const { electedClientId, electedParentId, electionSequenceNumber } =
			this.clientElection.serialize();
		return {
			electedClientId,
			electedParentId,
			electionSequenceNumber: this.lastSummaryAckSeqForClient ?? electionSequenceNumber,
		};
	}

	public static isClientEligible(client: ITrackedClient): boolean {
		const details = client.client.details;
		if (details === undefined) {
			// Very old clients back-compat
			return true;
		}
		return SummarizerClientElection.clientDetailsPermitElection(details);
	}

	public static readonly clientDetailsPermitElection = (details: IClientDetails): boolean =>
		details.capabilities.interactive || details.type === summarizerClientType;
}
