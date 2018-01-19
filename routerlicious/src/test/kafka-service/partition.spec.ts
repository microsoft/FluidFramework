import * as assert from "assert";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import { Partition } from "../../kafka-service/partition";
import * as utils from "../../utils";
import { KafkaMessageFactory, TestConsumer, TestKafka } from "../testUtils/index";

class TestLambda implements IPartitionLambda {
    constructor(private factory: TestPartitionLambdaFactory, private throwHandler: boolean) {
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        if (this.throwHandler) {
            throw "Requested failure";
        }

        this.factory.handleCount++;
    }
}

class TestPartitionLambdaFactory implements IPartitionLambdaFactory {
    public handleCount = 0;
    private failCreate = false;
    private throwHandler = false;

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return this.failCreate ? Promise.reject("Set to fail create") : new TestLambda(this, this.throwHandler);
    }

    public async dispose(): Promise<void> {
        return;
    }

    public setFailCreate(value: boolean) {
        this.failCreate = value;
    }

    public setThrowHandler(value: boolean) {
        this.throwHandler = value;
    }
}

describe("kafka-service", () => {
    describe("Partition", () => {
        let testConsumer: TestConsumer;
        let testConfig: Provider;
        let kafkaMessageFactory: KafkaMessageFactory;
        let testFactory: TestPartitionLambdaFactory;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            testConfig = (new Provider({})).defaults({}).use("memory");
            testFactory = new TestPartitionLambdaFactory();
            kafkaMessageFactory = new KafkaMessageFactory();
        });

        describe(".stop", () => {
            it("Should stop message processing", async () => {
                const testPartition = new Partition(0, testFactory, testConsumer, testConfig);
                await testPartition.stop();
            });

            it("Should process all pending messages prior to stopping", async () => {
                const testPartition = new Partition(0, testFactory, testConsumer, testConfig);
                let messageCount = 10;
                for (let i = 0; i < messageCount; i++) {
                    testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                }
                await testPartition.stop();

                assert.equal(messageCount, testFactory.handleCount);
            });

            it("Should emit the close event with restart true if cannot create lambda", async () => {
                testFactory.setFailCreate(true);
                return new Promise<void>((resolve, reject) => {
                    const testPartition = new Partition(0, testFactory, testConsumer, testConfig);
                    testPartition.on("close", (error, restart) => {
                        assert(error);
                        assert(restart);
                        resolve();
                    });
                });
            });

            it("Should emit the close event with restart true if handler throws", async () => {
                testFactory.setThrowHandler(true);
                return new Promise<void>((resolve, reject) => {
                    const testPartition = new Partition(0, testFactory, testConsumer, testConfig);
                    testPartition.on("close", (error, restart) => {
                        assert(error);
                        assert(restart);
                        resolve();
                    });

                    // Send a message to trigger the failure
                    testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                });
            });
        });
    });
});
