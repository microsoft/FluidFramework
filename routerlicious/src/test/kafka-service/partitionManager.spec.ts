import * as assert from "assert";
import * as nconf from "nconf";
import { ICheckpointStrategy } from "../../kafka-service/checkpointManager";
import { IPartitionLambda, IPartitionLambdaFactory } from "../../kafka-service/lambdas";
import { Partition } from "../../kafka-service/partition";
import * as utils from "../../utils";
import { TestKafka } from "../testUtils";

class TestLambda implements IPartitionLambda {
    private lastOffset: number;

    constructor(private factory: TestPartitionLambdaFactory) {
    }

    public handler(message: utils.kafkaConsumer.IMessage): Promise<any> {
        assert.ok((this.lastOffset === undefined) || (this.lastOffset + 1 === message.offset));
        this.lastOffset = message.offset;
        this.factory.handledMessages++;
        return Promise.resolve();
    }
}

class CheckpointStrategy implements ICheckpointStrategy {
    public shouldCheckpoint(offset: number): boolean {
        return true;
    }
}

class TestPartitionLambdaFactory implements IPartitionLambdaFactory {
    public handledMessages = 0;

    public create(): Promise<IPartitionLambda> {
        return Promise.resolve(new TestLambda(this));
    }
}

describe("kafka-service", () => {
    describe("PartitionManager", () => {
        let partition: Partition;
        let factory: TestPartitionLambdaFactory;
        let kafka: TestKafka;

        beforeEach(() => {
            const config = nconf.use("memory");
            kafka = new TestKafka();
            factory = new TestPartitionLambdaFactory();
            partition = new Partition(0, factory, new CheckpointStrategy(), kafka.createConsumer(), config);
        });

        describe(".process()", () => {
            it("Should be able to stop after starting", async () => {
                const TotalMessages = 100;
                for (let i = 0; i < TotalMessages; i++) {
                    const message: utils.kafkaConsumer.IMessage = {
                        highWaterOffset: TotalMessages,
                        key: "test",
                        offset: i,
                        partition: 0,
                        topic: "test",
                        value: "test",
                    };
                    partition.process(message);
                }

                // stop the partition to process all pending messages
                await partition.stop();
            });
        });
    });
});
