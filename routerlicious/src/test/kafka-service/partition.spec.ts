import * as assert from "assert";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import { Partition } from "../../kafka-service/partition";
import * as utils from "../../utils";
import { KafkaMessageFactory, TestConsumer, TestKafka } from "../testUtils/index";

class TestLambda implements IPartitionLambda {
    constructor(private factory: TestPartitionLambdaFactory) {
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        this.factory.handleCount++;

        // TODO be able to throw an exception here
    }
}

class TestPartitionLambdaFactory implements IPartitionLambdaFactory {
    public handleCount = 0;

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // TODO be able to throw an exception here

        return new TestLambda(this);
    }

    public async dispose(): Promise<void> {
        return;
    }
}

describe("kafka-service", () => {
    describe("Partition", () => {
        let testConsumer: TestConsumer;
        let testConfig: Provider;
        let testPartition: Partition;
        let kafkaMessageFactory: KafkaMessageFactory;
        let testFactory: TestPartitionLambdaFactory;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            testConfig = (new Provider({})).defaults({}).use("memory");
            testFactory = new TestPartitionLambdaFactory();
            testPartition = new Partition(0, testFactory, testConsumer, testConfig);
            kafkaMessageFactory = new KafkaMessageFactory();
        });

        describe(".stop", () => {
            it("Should stop message processing", async () => {
                await testPartition.stop();
            });

            it("Should process all pending messages prior to stopping", async () => {
                let messageCount = 0;
                for (let i = 0; i < messageCount; i++) {
                    testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                }
                await testPartition.stop();

                assert.equal(messageCount, testFactory.handleCount);
            });
        });
    });
});
