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
import type { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { summarizerClientType } from "./summarizerTypes.js";
// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
import type { ISummaryCollectionOpEvents } from "./summaryCollection.js";

/**
 * Snapshot state for summary-progress tracking and compatibility with older election readers.
 * @internal
 */
export interface ISerializedElection {
	/**
	 * Sequence number used to count ops since the last summary ack or a new opportunity to summarize.
	 * Starting a child, returning responsibility to the parent, or choosing a new parent
	 * without a child resets this baseline.
	 *
	 * @remarks A more accurate name is `summaryProgressBaselineSequenceNumber`.
	 * The historical field name is retained for snapshot compatibility.
	 */
	readonly electionSequenceNumber: number;
	/**
	 * Compatibility only: readers starting with 3.12 ignore this field on load.
	 * Keep writing it while 3.11-or-earlier readers remain supported.
	 * Records the oldest summarizer, or the parent if none exists.
	 */
	readonly electedClientId: string | undefined;
	/**
	 * Compatibility only: readers starting with 3.12 ignore this field on load.
	 * Keep writing it while 3.11-or-earlier readers remain supported.
	 * Records the oldest eligible interactive parent.
	 */
	readonly electedParentId: string | undefined;
}

export interface ISummarizerClientElectionEvents extends IEvent {
	(event: "electedSummarizerChanged", handler: () => void): void;
}

export interface ISummarizerClientElection
	extends IEventProvider<ISummarizerClientElectionEvents> {
	readonly electedParentId: string | undefined;
	/** Whether any summarizer-type client is in quorum, regardless of who created it or whether it is summarizing. */
	readonly summarizerExistsInQuorum: boolean;
}

/**
 * Elects the oldest eligible interactive quorum member as the parent responsible
 * for creating an automatic summarizer.
 *
 * The elected parent may create a child only when no summarizer exists in quorum.
 * Each child's parent manages and cleans up that child. A change of elected parent
 * does not transfer an existing child to the newly elected parent.
 *
 * When the elected parent leaves quorum, the oldest remaining eligible interactive
 * client becomes the elected parent. It waits for all summarizers to leave quorum
 * before creating a replacement, regardless of who created them or whether they
 * are currently summarizing.
 *
 * Summary-progress telemetry uses a baseline retained across snapshot loads.
 */
export class SummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	private _electedParentId: string | undefined;
	private _summarizerExistsInQuorum = false;
	/** Advanced by acks; reset when summarizer presence changes or the parent changes without a child. */
	private progressSequenceNumber: number;
	/**
	 * Sequence number of the last stalled-summary telemetry warning.
	 * Another warning requires more than maxOpsSinceLastSummary ops since the previous warning.
	 */
	private lastReportedSequenceNumber = 0;

	public get electedParentId(): string | undefined {
		return this._electedParentId;
	}

	public get summarizerExistsInQuorum(): boolean {
		return this._summarizerExistsInQuorum;
	}

	constructor(
		logger: ITelemetryBaseLogger,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
		private readonly quorum: Pick<IQuorumClients, "getMembers" | "on">,
		// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
		summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
		maxOpsSinceLastSummary: number,
		initialProgressSequenceNumber: number,
	) {
		super();
		const childLogger = createChildLogger({ logger, namespace: "SummarizerClientElection" });
		this.progressSequenceNumber = initialProgressSequenceNumber;
		this.updateStateFromQuorum();

		const handleQuorumChange = (): void => {
			const previousElectedParentId = this.electedParentId;
			const previousSummarizerExistsInQuorum = this.summarizerExistsInQuorum;

			this.updateStateFromQuorum();
			const electedParentChanged = previousElectedParentId !== this.electedParentId;
			const summarizerExistenceChanged =
				previousSummarizerExistsInQuorum !== this.summarizerExistsInQuorum;

			if (electedParentChanged || summarizerExistenceChanged) {
				// Give a newly started child or a parent creating a replacement time to make progress.
				// Keep counting through parent changes while summarizers remain in quorum.
				if (
					summarizerExistenceChanged ||
					(electedParentChanged && !this.summarizerExistsInQuorum)
				) {
					this.progressSequenceNumber = deltaManager.lastSequenceNumber;
				}

				childLogger.sendTelemetryEvent({
					eventName: "ElectionChanged",
					previousElectedParentId,
					electedParentId: this.electedParentId,
					previousSummarizerExistsInQuorum,
					summarizerExistsInQuorum: this.summarizerExistsInQuorum,
					sequenceNumber: deltaManager.lastSequenceNumber,
				});
				this.emit("electedSummarizerChanged");
			}
		};
		quorum.on("addMember", handleQuorumChange);
		quorum.on("removeMember", handleQuorumChange);

		// "default" is raised for sequenced messages other than summary proposals, acks, and nacks.
		summaryCollection.on("default", ({ sequenceNumber }) => {
			if (this.electedParentId === undefined && !this.summarizerExistsInQuorum) {
				return;
			}

			const opsWithoutSummary = sequenceNumber - this.progressSequenceNumber;
			if (
				opsWithoutSummary > maxOpsSinceLastSummary &&
				sequenceNumber - this.lastReportedSequenceNumber > maxOpsSinceLastSummary
			) {
				childLogger.sendTelemetryEvent({
					eventName: "ElectedClientNotSummarizing",
					electedClientId: this.serialize().electedClientId,
					electedParentId: this.electedParentId,
					summarizerExistsInQuorum: this.summarizerExistsInQuorum,
					electionSequenceNumber: this.progressSequenceNumber,
					opsWithoutSummary,
				});
				this.lastReportedSequenceNumber = sequenceNumber;
			}
		});

		summaryCollection.on(MessageType.SummaryAck, (op) => {
			this.progressSequenceNumber = op.sequenceNumber;
		});
	}

	private updateStateFromQuorum(): void {
		let parentId: string | undefined;
		let parentSequenceNumber = Number.POSITIVE_INFINITY;
		let summarizerExistsInQuorum = false;
		for (const [clientId, member] of this.quorum.getMembers()) {
			const details = member.client.details;
			if (details?.type === summarizerClientType) {
				summarizerExistsInQuorum = true;
			} else if (
				(details === undefined || details.capabilities.interactive) &&
				member.sequenceNumber < parentSequenceNumber
			) {
				parentId = clientId;
				parentSequenceNumber = member.sequenceNumber;
			}
		}
		this._electedParentId = parentId;
		this._summarizerExistsInQuorum = summarizerExistsInQuorum;
	}

	public serialize(): ISerializedElection {
		// Retain this identity for snapshot compatibility: older readers wait while the recorded summarizer is present.
		// Current election decisions use only the parent and whether any summarizer is in quorum.
		let summarizerId: string | undefined;
		let sequenceNumber = Number.POSITIVE_INFINITY;
		for (const [id, member] of this.quorum.getMembers()) {
			if (
				member.client.details?.type === summarizerClientType &&
				member.sequenceNumber < sequenceNumber
			) {
				summarizerId = id;
				sequenceNumber = member.sequenceNumber;
			}
		}
		return {
			electionSequenceNumber: this.progressSequenceNumber,
			electedClientId: summarizerId ?? this.electedParentId,
			electedParentId: this.electedParentId,
		};
	}

	public static readonly clientDetailsPermitElection = (details: IClientDetails): boolean =>
		details.capabilities.interactive || details.type === summarizerClientType;
}
