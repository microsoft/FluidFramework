import * as assert from "assert";
import { KafkaRunner } from "../../kafka-service/runner";
import { TestKafka } from "../testUtils";

describe("kafka-service", () => {
    describe("Runner", () => {
        let runner: KafkaRunner;
        let kafka: TestKafka;

        beforeEach(() => {
            kafka = new TestKafka();
            runner = new KafkaRunner(kafka.createConsumer(), 10, 100);
        });

        describe("#start()", () => {
            it("Should be able to stop after starting", async () => {
                assert.ok(true);
            });
        });
    });

    describe("PartitionManager", () => {
        //
    });
});
