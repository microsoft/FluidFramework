/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambda } from "@fluidframework/server-services-core";
import {
	KafkaMessageFactory,
	MessageFactory,
	TestCollection,
	TestContext,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { ScriptoriumLambda } from "../../scriptorium/lambda";

describe("Routerlicious", () => {
	describe("Scriptorium", () => {
		describe("Lambda", () => {
			const testTenantId = "test";
			const testDocumentId = "test";
			const testClientId = "test";

			let testCollection: TestCollection;
			let testContext: TestContext;
			let messageFactory: MessageFactory;
			let kafkaMessageFactory: KafkaMessageFactory;
			let lambda: IPartitionLambda;

			beforeEach(() => {
				messageFactory = new MessageFactory(testDocumentId, testClientId, testTenantId);
				kafkaMessageFactory = new KafkaMessageFactory();

				testCollection = new TestCollection([]);
				testContext = new TestContext();

				lambda = new ScriptoriumLambda(testCollection, testContext, undefined, undefined);
			});

			describe(".handler()", () => {
				it("Should store incoming messages to database", async () => {
					const numMessages = 10;
					for (let i = 0; i < numMessages; i++) {
						const message = messageFactory.createSequencedOperation();
						lambda.handler(
							kafkaMessageFactory.sequenceMessage(message, testDocumentId),
						);
					}
					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					assert.equal(numMessages, testCollection.collection.length);
				});
			});
		});
	});
});
