import * as assert from "assert";
import * as nconf from "nconf";
import * as plugin from "../../document-router";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import { createTestPlugin, KafkaMessageFactory, MessageFactory } from "../testUtils";

class TestContext implements IContext {
    public offset;

    public checkpoint(offset: number) {
        this.offset = offset;
    }
}

describe("DocumentRouter", () => {
    describe("Lambda", () => {
        let factory: IPartitionLambdaFactory;
        let config: nconf.Provider;
        let lambda: IPartitionLambda;
        let context: TestContext;
        let messageFactory: MessageFactory;
        let kafkaMessageFactory: KafkaMessageFactory;

        beforeEach(async () => {
            const defaultConfig = {
                documentLambda: createTestPlugin(),
            };

            messageFactory = new MessageFactory("test", "test");
            kafkaMessageFactory = new KafkaMessageFactory("test", 8);
            factory = plugin.create();
            config = (new nconf.Provider({})).defaults(defaultConfig).use("memory");
            context = new TestContext();
            lambda = await factory.create(config, context);
        });

        describe(".handler()", () => {
            it("Should be able to process a message", async () => {
                const message = messageFactory.create();
                const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                await lambda.handler(kafkaMessage);
                assert.ok(true);
            });
        });
    });
});
