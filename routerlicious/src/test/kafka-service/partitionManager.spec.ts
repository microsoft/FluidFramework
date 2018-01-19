import * as assert from "assert";
import { Provider } from "nconf";
import { PartitionManager } from "../../kafka-service/partitionManager";
import { KafkaMessageFactory, TestConsumer, TestKafka } from "../testUtils";
import { TestPartitionLambdaFactory } from "./testPartitionLambdaFactory";

describe("kafka-service", () => {
    describe("PartitionManager", () => {
        let testManager: PartitionManager;
        let testFactory: TestPartitionLambdaFactory;
        let testKafka: TestKafka;
        let testConsumer: TestConsumer;
        let kafkaMessageFactory: KafkaMessageFactory;

        beforeEach(() => {
            const config = (new Provider({})).defaults({}).use("memory");
            testKafka = new TestKafka();
            testFactory = new TestPartitionLambdaFactory();
            testConsumer = testKafka.createConsumer();
            testManager = new PartitionManager(testFactory, testConsumer, config);
            kafkaMessageFactory = new KafkaMessageFactory();
        });

        describe(".process", () => {
            it("Should be able to stop after processing messages", async () => {
                let messageCount = 10;
                for (let i = 0; i < messageCount; i++) {
                    testManager.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                }

                await testManager.stop();

                assert.equal(messageCount, testFactory.handleCount);
            });

            it("Should emit an error event if a partition encounters an error", async () => {
                testFactory.setThrowHandler(true);
                const closeP = new Promise<void>((resolve, reject) => {
                    testManager.on("close", (error, restart) => {
                        assert(error);
                        assert(restart);
                        resolve();
                    });
                });

                testManager.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                await closeP;
            });
        });
    });
});
