/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import { MessageType } from "@fluidframework/protocol-definitions";
import { OrderedClientElection, ITrackedClient } from "./orderedClientElection";
import { ISummaryCollectionOpEvents } from "./summaryCollection";

export const summarizerClientType = "summarizer";

/**
 * This class encapsulates logic around tracking the elected summarizer client.
 * It will handle updated the elected client when a summary ack hasn't been seen
 * for some configured number of ops.
 */
export class SummarizerClientElection {
    /** Used to calculate number of ops since last summary ack for the current elected client */
    private lastSummaryAckSeqForClient = 0;
    private _hasSummarizersInQuorum: boolean;
    private hasLoggedTelemetry = false;

    public get electedClientId() {
        return this.clientElection.getElectedClient()?.clientId;
    }

    public get hasSummarizersInQuorum() {
        return this._hasSummarizersInQuorum;
    }

    constructor(
        private readonly logger: ITelemetryLogger,
        private readonly summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
        public readonly clientElection: OrderedClientElection,
        private readonly maxOpsSinceLastSummary: number,
        private readonly refreshSummarizer: () => void,
    ) {
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
                    sequenceNumber: op.sequenceNumber,
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
            const prev = this._hasSummarizersInQuorum;
            this._hasSummarizersInQuorum = summarizerCount > 0;
            if (prev !== this._hasSummarizersInQuorum) {
                this.refreshSummarizer();
            }
        });
        this.clientElection.on("electedChange", (client: ITrackedClient | undefined) => {
            this.hasLoggedTelemetry = false;
            if (client !== undefined) {
                // set to join seq
                this.lastSummaryAckSeqForClient = client.sequenceNumber;
            }
            this.refreshSummarizer();
        });
        this._hasSummarizersInQuorum = this.clientElection.getSummarizerCount() > 0;
    }
}
