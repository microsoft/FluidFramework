/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { IGitManager } from "@fluidframework/server-services-client";
import { ICreateTreeEntry, ICreateTreeParams, ITree } from "@fluidframework/gitresources";
import { GitManager } from "@fluidframework/server-services-client";
import {
	DefaultServiceConfiguration,
	IProducer,
	ITenantManager,
	MongoManager,
} from "@fluidframework/server-services-core";
import {
	KafkaMessageFactory,
	MessageFactory,
	TestCollection,
	TestContext,
	TestDbFactory,
	TestDeltaManager,
	TestNotImplementedDocumentRepository,
	TestKafka,
	TestTenantManager,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import _ from "lodash";
import Sinon from "sinon";
import { ScribeLambda } from "../../scribe/lambda";
import { ScribeLambdaFactory } from "../../scribe/lambdaFactory";

describe("Routerlicious", () => {
	describe("Scribe", () => {
		describe("Lambda", () => {
			const testClientId = "test";
			const testTenantId = "test";
			const testDocumentId = "test";

			let testMongoManager: MongoManager;
			let testDocumentRepository: TestNotImplementedDocumentRepository;
			let testMessageCollection: TestCollection;
			let testProducer: IProducer;
			let testContext: TestContext;
			let testTenantManager: ITenantManager;
			let testKafka: TestKafka;
			let messageFactory: MessageFactory;
			let kafkaMessageFactory: KafkaMessageFactory;
			let lambda: ScribeLambda;
			let testGitManager: GitManager;
			let tree: ITree;

			function sendOps(num: number): void {
				for (let i = 0; i < num; i++) {
					const message = messageFactory.createSequencedOperation();
					lambda.handler(kafkaMessageFactory.sequenceMessage(message, testDocumentId));
				}
			}

			async function sendSummarize(referenceSequenceNumber: number): Promise<void> {
				const summaryMessage = messageFactory.createSummarize(
					referenceSequenceNumber,
					tree.sha,
				);
				lambda.handler(kafkaMessageFactory.sequenceMessage(summaryMessage, testDocumentId));

				await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testDocumentId));

				const ackMessage = messageFactory.createSummaryAck(tree.sha);
				lambda.handler(kafkaMessageFactory.sequenceMessage(ackMessage, testDocumentId));
			}

			beforeEach(async () => {
				messageFactory = new MessageFactory(testDocumentId, testClientId, testTenantId);
				kafkaMessageFactory = new KafkaMessageFactory();

				const testData = [
					{
						documentId: testDocumentId,
						tenantId: testTenantId,
						sequenceNumber: 0,
						logOffset: undefined,
					},
				];
				const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
				testMongoManager = new MongoManager(dbFactory);
				testDocumentRepository = new TestNotImplementedDocumentRepository();
				Sinon.replace(
					testDocumentRepository,
					"readOne",
					Sinon.fake.resolves(_.cloneDeep(testData[0])),
				);
				Sinon.replace(testDocumentRepository, "updateOne", Sinon.fake.resolves(undefined));
				testMessageCollection = new TestCollection([]);
				testKafka = new TestKafka();
				testProducer = testKafka.createProducer();
				testTenantManager = new TestTenantManager();
				testGitManager = (await testTenantManager.getTenantGitManager(
					testTenantId,
					testDocumentId,
				)) as GitManager;
				const createTreeEntry: ICreateTreeEntry[] = [];
				const requestBody: ICreateTreeParams = {
					tree: createTreeEntry,
				};
				tree = await testGitManager.createGitTree(requestBody);
				testGitManager.addTree(tree);
				const testDeltaManager = new TestDeltaManager();

				let factory = new ScribeLambdaFactory(
					testMongoManager,
					testDocumentRepository,
					testMessageCollection,
					testProducer,
					testDeltaManager,
					testTenantManager,
					DefaultServiceConfiguration,
					false,
					false,
					[],
				);

				testContext = new TestContext();
				lambda = (await factory.create(
					{ documentId: testDocumentId, tenantId: testTenantId, leaderEpoch: 0 },
					testContext,
				)) as ScribeLambda;
				messageFactory.createSequencedOperation(); // mock join op.
			});

			describe(".handler()", () => {
				it("Ops should be stored in mongodb", async () => {
					const numMessages = 10;
					sendOps(numMessages);
					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					assert.equal(numMessages, testMessageCollection.collection.length);
				});

				it("Summarize Ops should clean up the previous ops store in mongodb", async () => {
					const numMessages = 10;
					sendOps(numMessages);

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					sendSummarize(numMessages);

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					assert.equal(testMessageCollection.collection.length, 2);
				});

				it("NoClient Ops will trigger service to generate summary and won't clean up the previous ops", async () => {
					const numMessages = 5;
					sendOps(numMessages);

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					sendSummarize(numMessages);

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					sendOps(numMessages);

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					const message = messageFactory.createNoClient();
					lambda.handler(kafkaMessageFactory.sequenceMessage(message, testDocumentId));

					await testContext.waitForOffset(
						kafkaMessageFactory.getHeadOffset(testDocumentId),
					);

					assert.equal(testMessageCollection.collection.length, 8);
				});
			});
		});
	});
});
