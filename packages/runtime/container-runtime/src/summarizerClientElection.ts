/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { OrderedClientElection, ITrackedClient } from "./orderedClientElection";
import { ISummaryCollectionOpEvents } from "./summaryCollection";

export const summarizerClientType = "summarizer";

export interface ISummarizerClientElectionEvents extends IEvent {
    // Will rename in later PR
    (event: "shouldSummarizeStateChanged", handler: () => void): void;
}

/**
 * This class encapsulates logic around tracking the elected summarizer client.
 * It will handle updated the elected client when a summary ack hasn't been seen
 * for some configured number of ops.
 */
export class SummarizerClientElection extends TypedEventEmitter<ISummarizerClientElectionEvents> {
    /** Used to calculate number of ops since last summary ack for the current elected client */
    private lastSummaryAckSeqForClient = 0;
    private _hasAnySummarizersInQuorum: boolean;
    private hasLoggedTelemetry = false;

    public get electedClientId() {
        return this.clientElection.getElectedClient()?.clientId;
    }

    public get hasSummarizersInQuorum() {
        return this._hasAnySummarizersInQuorum;
    }

    constructor(
        private readonly logger: ITelemetryLogger,
        private readonly summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
        public readonly clientElection: OrderedClientElection,
        private readonly maxOpsSinceLastSummary: number,
    ) {
        super();
        this.summaryCollection.on("default", (op) => {
            const opsSinceLastAckForClient = op.sequenceNumber - this.lastSummaryAckSeqForClient;
            if (
                opsSinceLastAckForClient > this.maxOpsSinceLastSummary
                && !this.hasLoggedTelemetry
                && this.electedClientId !== undefined
            ) {
                // Limit telemetry to only next client?
                this.logger.sendErrorEvent({
                    eventName: "ElectedClientNotSummarizing",
                    electedClientId: this.electedClientId,
                    lastSummaryAckSeqForClient: this.lastSummaryAckSeqForClient,
                });

                // In future we will change the elected client.
                // this.orderedClients.incrementCurrentClient();

                this.hasLoggedTelemetry = true;
            }
        });

        this.summaryCollection.on(MessageType.SummaryAck, (op) => {
            this.hasLoggedTelemetry = false;
            this.lastSummaryAckSeqForClient = op.sequenceNumber;
        });

        this.clientElection.on("summarizerChange", (summarizerCount) => {
            // Check if the number of summarizers in the quorum switches between zero
            // and non-zero. That can indicate a change in whether we should summarize
            // or not since we wait until the quorum no longer has any summarizers in
            // the quorum before starting our own summarizer.
            // Note this will be removed in a follow-up PR.
            const previouslyHadAnySummarizersInQuorum = this._hasAnySummarizersInQuorum;
            this._hasAnySummarizersInQuorum = summarizerCount > 0;
            if (previouslyHadAnySummarizersInQuorum !== this._hasAnySummarizersInQuorum) {
                this.emit("shouldSummarizeStateChanged");
            }
        });
        this.clientElection.on("electedChange", (client: ITrackedClient | undefined) => {
            this.hasLoggedTelemetry = false;
            if (client !== undefined) {
                // set to join seq
                this.lastSummaryAckSeqForClient = client.sequenceNumber;
            }
            this.emit("shouldSummarizeStateChanged");
        });
        this._hasAnySummarizersInQuorum = this.clientElection.getSummarizerCount() > 0;
    }
}
