/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultServiceConfiguration, ICollection, IDocument, IProducer, ITenantManager, MongoManager } from "@fluidframework/server-services-core";
import { KafkaMessageFactory, MessageFactory, TestCollection, TestContext, TestDbFactory, TestKafka, TestTenantManager } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import _ from "lodash";
import nconf from "nconf";
import { ScribeLambda } from "../../Scribe/lambda";
import { ScribeLambdaFactory } from "../../scribe/lambdaFactory";

describe("Routerlicious", () => {
    describe("Scribe", () => {
        describe("Lambda", () => {
            const testClientId = "test";
            const testTenantId = "test";
            const testDocumentId = "test";

            let testMongoManager: MongoManager;
            let testDocumentCollection: ICollection<IDocument>;
            let testMessageCollection: TestCollection;
            let testProducer: IProducer;
            let testContext: TestContext;
            let testTenantManager: ITenantManager;
            let testKafka: TestKafka;
            let messageFactory: MessageFactory;
            let kafkaMessageFactory: KafkaMessageFactory;
            let lambda: ScribeLambda;

            beforeEach(async() => {
                messageFactory = new MessageFactory(testDocumentId, testClientId, testTenantId);
                kafkaMessageFactory = new KafkaMessageFactory();

                const testData = [{ documentId: testDocumentId, tenantId: testTenantId, sequenceNumber: 0, logOffset: undefined }];
                const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
                testMongoManager = new MongoManager(dbFactory);
                const database = await testMongoManager.getDatabase();
                testDocumentCollection = database.collection("documents");                
                testMessageCollection = new TestCollection([]);
                testKafka = new TestKafka();
                testProducer = testKafka.createProducer();
                testTenantManager = new TestTenantManager();

                let factory = new ScribeLambdaFactory(
                    testMongoManager,
                    testDocumentCollection,
                    testMessageCollection,
                    testProducer,
                    testTenantManager,
                    DefaultServiceConfiguration);

                testContext = new TestContext();
                const config = (new nconf.Provider({})).defaults({ documentId: testDocumentId, tenantId: testTenantId })
                    .use("memory");
                lambda = await factory.create(config, testContext) as ScribeLambda;
            });

            describe(".handler()", () => {
                it("op", async () => {
                    const numMessages = 10;
                    for (let i = 0; i < numMessages; i++) {
                        const message = messageFactory.createSequencedOperation();
                        lambda.handlerCore(kafkaMessageFactory.sequenceMessage(message, testDocumentId));

                    }
                    await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testDocumentId));

                    assert.equal(numMessages, testMessageCollection.collection.length);
                });

                // it("summarize", async () => {
                //     const message = messageFactory.createSummarize();
                //     message.operation.type = MessageType.Summarize;
                //     lambda.handlerCore(kafkaMessageFactory.sequenceMessage(message, testDocumentId));
                    
                //     await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testDocumentId));

                // });

                it("noclient", async () => {
                    const numMessages = 10;
                    for (let i = 0; i < numMessages; i++) {
                        const message = messageFactory.createSequencedOperation();
                        lambda.handlerCore(kafkaMessageFactory.sequenceMessage(message, testDocumentId));

                    }
                    const message = messageFactory.createNoClient();
                    lambda.handlerCore(kafkaMessageFactory.sequenceMessage(message, testDocumentId));

                    await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testDocumentId));

                    assert.equal(numMessages, testMessageCollection.collection.length);
                });
            });
        });
    });
});
