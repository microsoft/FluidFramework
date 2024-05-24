/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultHash } from "@fluidframework/server-services-client";
import * as testUtils from "@fluidframework/server-test-utils";
import { CheckpointContext } from "../../deli/checkpointContext";
import {
	createDeliCheckpointManagerFromCollection,
	ICheckpointParams,
} from "../../deli/checkpointManager";
import { CheckpointReason } from "../../utils";
import Sinon from "sinon";

describe("Routerlicious", () => {
	describe("Deli", () => {
		describe("CheckpointContext", () => {
			const testId = "test";
			const testTenant = "test";
			let testCheckpointContext: CheckpointContext;
			let testDocumentRepository: testUtils.TestNotImplementedDocumentRepository;
			let testCheckpointService: testUtils.TestNotImplementedCheckpointService;
			let testContext: testUtils.TestContext;

			function createCheckpoint(
				logOffset: number,
				sequenceNumber: number,
			): ICheckpointParams {
				const queuedMessage = {
					offset: logOffset,
					partition: 1,
					topic: "topic",
					value: "",
				};

				return {
					reason: CheckpointReason.EveryMessage,
					deliState: {
						clients: undefined,
						durableSequenceNumber: 0,
						expHash1: defaultHash,
						logOffset,
						sequenceNumber,
						signalClientConnectionNumber: 0,
						lastSentMSN: 0,
						nackMessages: undefined,
						checkpointTimestamp: Date.now(),
					},
					deliCheckpointMessage: queuedMessage,
					kafkaCheckpointMessage: queuedMessage,
				};
			}

			beforeEach(() => {
				testContext = new testUtils.TestContext();
				testDocumentRepository = new testUtils.TestNotImplementedDocumentRepository();
				testCheckpointService = new testUtils.TestNotImplementedCheckpointService();
				Sinon.replace(testDocumentRepository, "updateOne", Sinon.fake());
				Sinon.replace(testCheckpointService, "writeCheckpoint", Sinon.fake());
				Sinon.replace(
					testCheckpointService,
					"getLocalCheckpointEnabled",
					Sinon.fake.returns(false),
				);
				const checkpointManager = createDeliCheckpointManagerFromCollection(
					testTenant,
					testId,
					testCheckpointService,
				);
				testCheckpointContext = new CheckpointContext(
					testTenant,
					testId,
					checkpointManager,
					testContext,
					testCheckpointService,
				);
			});

			describe(".checkpoint", () => {
				it("Should be able to submit a new checkpoint", async () => {
					testCheckpointContext.checkpoint(createCheckpoint(0, 0));
					await testContext.waitForOffset(0);
				});

				it("Should be able to submit multiple checkpoints", async () => {
					const numCheckpoints = 10;
					for (let i = 0; i < numCheckpoints + 1; i++) {
						testCheckpointContext.checkpoint(createCheckpoint(i, i));
					}
					await testContext.waitForOffset(numCheckpoints);
				});
			});
		});
	});
});
