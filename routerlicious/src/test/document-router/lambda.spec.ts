import * as assert from "assert";
import * as nconf from "nconf";
import * as plugin from "../../document-router";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import {
    createTestModule,
    ITestLambdaModule,
    KafkaMessageFactory,
    MessageFactory,
} from "../testUtils";

class TestContext implements IContext {
    public offset;

    public checkpoint(offset: number) {
        this.offset = offset;
    }
}

describe("DocumentRouter", () => {
    describe("Lambda", () => {
        let testModule: ITestLambdaModule;
        let factory: IPartitionLambdaFactory;
        let config: nconf.Provider;
        let lambda: IPartitionLambda;
        let context: TestContext;
        let defaultMessageFactory: MessageFactory;
        let kafkaMessageFactory: KafkaMessageFactory;

        beforeEach(async () => {
            testModule = createTestModule();
            const defaultConfig = {
                documentLambda: testModule,
            };

            defaultMessageFactory = new MessageFactory("test", "test");
            kafkaMessageFactory = new KafkaMessageFactory();
            factory = plugin.create();
            config = (new nconf.Provider({})).defaults(defaultConfig).use("memory");
            context = new TestContext();
            lambda = await factory.create(config, context);
        });

        describe(".handler()", () => {
            it("Should be able to process a document message from a single document", async () => {
                const message = defaultMessageFactory.createSequencedOperation();
                const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                await lambda.handler(kafkaMessage);

                // Should have created a single factory that itself created a single lambda
                assert.equal(testModule.factories.length, 1);
                assert.equal(testModule.factories[0].lambdas.length, 1);
            });

            it("Should be able to process a document message from multiple documents", async () => {
                const totalDocuments = 4;
                const messagesPerDocument = 10;

                const messageFactories: MessageFactory[] = [];
                for (let i = 0; i < totalDocuments; i++) {
                    messageFactories.push(new MessageFactory(`test${i}`, `client${i}`));
                }

                for (let i = 0; i < messagesPerDocument; i++) {
                    for (const messageFactory of messageFactories) {
                        const message = messageFactory.createSequencedOperation();
                        const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                        await lambda.handler(kafkaMessage);
                    }
                }

                // Should have created a single factory that itself created a single lambda
                assert.equal(testModule.factories.length, 1);
                assert.equal(testModule.factories[0].lambdas.length, totalDocuments);
            });
        });
    });
});
