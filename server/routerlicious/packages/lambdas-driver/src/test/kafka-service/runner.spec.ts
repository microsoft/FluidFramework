/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DebugLogger,
	TestConsumer,
	TestKafka,
	TestProducer,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { KafkaRunner } from "../../kafka-service/runner";
import { TestPartitionLambdaFactory } from "./testPartitionLambdaFactory";

describe("kafka-service", () => {
	describe("KafkaRunner", () => {
		let testRunner: KafkaRunner;
		let testFactory: TestPartitionLambdaFactory;
		let testKafka: TestKafka;
		let testConsumer: TestConsumer;
		let testProducer: TestProducer;

		beforeEach(() => {
			testKafka = new TestKafka();
			testFactory = new TestPartitionLambdaFactory();
			testConsumer = testKafka.createConsumer();
			testProducer = testKafka.createProducer();
			testRunner = new KafkaRunner(testFactory, testConsumer);
		});

		describe(".start", () => {
			it("Should be able to stop after processing messages", async () => {
				const startP = testRunner.start(DebugLogger.create("fluid-server:TestRunner"));
				testConsumer.rebalance();

				const messageCount = 10;
				for (let i = 0; i < messageCount; i++) {
					testProducer.send([{}], "test");
				}

				await testRunner.stop();

				// The start promise also should have been resolved
				await startP;
				assert.equal(messageCount, testFactory.handleCount);
			});

			async function verifyRejection(promise: Promise<any>): Promise<any> {
				await promise
					.then(() => {
						assert(false, "promise should have been rejected");
					})
					.catch((error) => {
						return;
					});
			}

			it("Should resolve start promise on kafka error ", async () => {
				const startP = testRunner.start(DebugLogger.create("fluid-server:TestRunner"));
				testConsumer.rebalance();

				testProducer.send([{}], "test");
				testConsumer.emitError("Test error");

				await verifyRejection(startP);
			});

			it("Should resolve start promise on lambda error ", async () => {
				const startP = testRunner.start(DebugLogger.create("fluid-server:TestRunner"));
				testFactory.setThrowHandler(true);
				testConsumer.rebalance();

				testProducer.send([{}], "test");

				await verifyRejection(startP);
			});
		});
	});
});
