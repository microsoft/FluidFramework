/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type { IEventProvider, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IQuorumClients } from "@fluidframework/driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import {
	type ISerializedElection,
	type ISummaryCollectionOpEvents,
	OrderedClientElection,
	SummarizerClientElection as LegacySummarizerClientElection,
} from "../../summary/index.js";

/**
 * Adapts construction to the consolidated contract without changing election behavior.
 * Remove this adapter when PR #28518 consolidates the production classes, and import the
 * production SummarizerClientElection directly in the shared test suite.
 */
export class SummarizerClientElection extends LegacySummarizerClientElection {
	constructor(
		logger: ITelemetryBaseLogger,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
		quorum: Pick<IQuorumClients, "getMembers" | "getMember" | "on">,
		summaryCollection: IEventProvider<ISummaryCollectionOpEvents>,
		maxOpsSinceLastSummary: number,
		initialState: ISerializedElection | number,
	) {
		// Normalize logger composition to the consolidated constructor's namespace.
		const electionLogger = createChildLogger({
			logger,
			namespace: "SummarizerClientElection",
		});
		const orderedElection = new OrderedClientElection(
			electionLogger,
			deltaManager,
			quorum,
			initialState,
			LegacySummarizerClientElection.isClientEligible,
		);
		super(electionLogger, summaryCollection, orderedElection, maxOpsSinceLastSummary);
	}

	public resetElectedClient(sequenceNumber: number): void {
		this.clientElection.resetElectedClient(sequenceNumber);
	}
}
