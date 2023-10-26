/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestConsumer, TestKafka } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { CheckpointManager } from "../../kafka-service/checkpointManager";
import { IQueuedMessage } from "@fluidframework/server-services-core";

describe("kafka-service", () => {
	describe("CheckpointManager", () => {
		const testPartition = 0;
		let checkpointManager: CheckpointManager;
		let testConsumer: TestConsumer;

		beforeEach(() => {
			const testKafka = new TestKafka();
			testConsumer = testKafka.createConsumer();
			checkpointManager = new CheckpointManager(testPartition, testConsumer);
		});

		describe(".checkpoint", () => {
			/**
			 * Helper function that invokes a checkpoint assuming it will fail
			 */
			async function verifyCheckpointError(queuedMessage: IQueuedMessage) {
				await checkpointManager
					.checkpoint(queuedMessage)
					.then(() => {
						assert.ok(false, "Should have resulted in rejection");
					})
					.catch((error) => {
						assert.ok(true);
					});
			}

			it("Should be able to checkpoint at the desired position", async () => {
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(10));
				await testConsumer.waitForOffset(10);
			});

			it("Should be able to checkpoint at multiple offsets", async () => {
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(10));
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(20));
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(30));
				await testConsumer.waitForOffset(30);
			});

			it("Should resolve to error on commit error", async () => {
				await checkpointManager.checkpoint(TestKafka.createdQueuedMessage(10));
				testConsumer.setFailOnCommit(true);
				await verifyCheckpointError(TestKafka.createdQueuedMessage(20));
			});

			it("Should always return an error once an error has occurred", async () => {
				await checkpointManager.checkpoint(TestKafka.createdQueuedMessage(10));
				testConsumer.setFailOnCommit(true);
				// Purposefully don't await the first call so we can queue a second checkpoint that also
				// will be marked as failed
				verifyCheckpointError(TestKafka.createdQueuedMessage(20));
				await verifyCheckpointError(TestKafka.createdQueuedMessage(30));
				await verifyCheckpointError(TestKafka.createdQueuedMessage(40));
			});
		});

		describe(".flush", () => {
			it("Should flush all pending offset writes", async () => {
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(10));
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(20));
				checkpointManager.checkpoint(TestKafka.createdQueuedMessage(30));
				await checkpointManager.flush();
				assert.equal(30, testConsumer.getOffset());
			});
		});
	});
});
