/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ISequencedClient } from "@fluidframework/driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	type ISummaryCollectionOpEvents,
	OrderedClientElection,
	SummarizerClientElection,
	summarizerClientType,
} from "../../summary/index.js";

import { TestQuorumClients } from "./testQuorumClients.js";

// Remove this suite when PR #28518 consolidates the two production classes. The shared
// election suite covers behavior; this test covers only the outgoing composition.
describe("Legacy election composition", () => {
	it("constructs the wrapper around an ordered election and forwards quorum transitions", () => {
		const quorum = new TestQuorumClients();
		const logger = new MockLogger().toTelemetryLogger();
		const summaries = new TypedEventEmitter<ISummaryCollectionOpEvents>();
		const deltaManager = { lastSequenceNumber: 0 };
		const orderedElection = new OrderedClientElection(
			logger,
			deltaManager,
			quorum,
			0,
			SummarizerClientElection.isClientEligible,
		);
		const election = new SummarizerClientElection(logger, summaries, orderedElection, 1000);
		let changes = 0;
		election.on("electedSummarizerChanged", () => changes++);

		const addClient = (id: string, summarizer = false): void => {
			const member: ISequencedClient = {
				sequenceNumber: ++deltaManager.lastSequenceNumber,
				client: {
					mode: "write",
					permission: [],
					scopes: [],
					user: { id },
					details: {
						capabilities: { interactive: !summarizer },
						type: summarizer ? summarizerClientType : undefined,
					},
				},
			};
			quorum.addClient(id, member);
		};
		addClient("a");
		assert.equal(election.electedClientId, "a");
		assert.equal(election.electedParentId, "a");
		addClient("s", true);
		assert.equal(orderedElection.electedClient?.clientId, "s");
		assert.equal(election.electedClientId, "s");
		deltaManager.lastSequenceNumber++;
		quorum.removeClient("s");
		assert.deepEqual(election.serialize(), orderedElection.serialize());
		assert.equal(election.electedClientId, "a");
		assert.equal(changes, 3);
	});
});
