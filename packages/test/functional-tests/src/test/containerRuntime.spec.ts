/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import {
    IClient,
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { DeltaManager } from "@fluidframework/container-loader";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluid-internal/test-loader-utils";
import { ScheduleManager, DeltaScheduler } from "@fluidframework/container-runtime";

describe("Container Runtime", () => {
    /**
     * The following tests test the async processing model of ContainerRuntime -
     * Batch messages are processed in a single turn no matter how long it takes to process them.
     * Non-batch messages are processed in multiple turns if they take longer than DeltaScheduler's processingTime.
     */
    describe("Async op processing", () => {
        let deltaManager: DeltaManager;
        let scheduleManager: ScheduleManager;
        let deltaConnection: MockDocumentDeltaConnection;
        let seq: number;
        const docId = "docId";
        let batchBegin: number = 0;
        let batchEnd: number = 0;

        async function startDeltaManager() {
            await deltaManager.connect();
            deltaManager.inbound.resume();
            deltaManager.outbound.resume();
            deltaManager.inboundSignal.resume();
        }

        // Function to yield control in the Javascript event loop.
        async function yieldEventLoop(): Promise<void> {
            await new Promise<void>((resolve) => {
                setTimeout(resolve);
            });
        }

        async function emitMessages(messages: ISequencedDocumentMessage[]) {
            deltaConnection.emitOp(docId, messages);
            // Yield the event loop because the inbound op will be processed asynchronously.
            await yieldEventLoop();
        }

        function getMessages(clientId: string, count: number): ISequencedDocumentMessage[] {
            const messages: Partial<ISequencedDocumentMessage>[] = [];
            for (let i = 0; i < count; i++) {
                const message: Partial<ISequencedDocumentMessage> = {
                    clientId,
                    minimumSequenceNumber: 0,
                    sequenceNumber: seq++,
                    type: MessageType.Operation,
                };
                messages.push(message);
            }

            return messages as ISequencedDocumentMessage[];
        }

        // Function to process an inbound op. It adds delay to simluate time taken in processing an op.
        function processOp(message: ISequencedDocumentMessage) {
            scheduleManager.beginOperation(message);

            // Add delay such that each op takes greater than the DeltaScheduler's processing time to process.
            const processingDelay = DeltaScheduler.processingTime + 10;
            const startTime = Date.now();
            while (Date.now() - startTime < processingDelay) { }

            scheduleManager.endOperation(undefined, message);
        }

        beforeEach(() => {
            seq = 1;
            deltaConnection = new MockDocumentDeltaConnection(
                "test",
            );
            const service = new MockDocumentService(
                undefined,
                () => deltaConnection,
            );
            const client: Partial<IClient> = { mode: "write", details: { capabilities: { interactive: true } } };

            deltaManager = new DeltaManager(
                () => service,
                client as IClient,
                DebugLogger.create("fluid:testDeltaManager"),
                false,
                () => false,
            );

            const emitter = new EventEmitter();
            scheduleManager = new ScheduleManager(
                deltaManager,
                emitter,
                DebugLogger.create("fluid:testScheduleManager"),
            );

            emitter.on("batchBegin", () => {
                // When we receive a "batchBegin" event, we should not have any outstanding
                // events, i.e., batchBegin and batchEnd should be equal.
                assert.strictEqual(batchBegin, batchEnd, "Received batchBegin before previous batchEnd");
                batchBegin++;
            });

            emitter.on("batchEnd", () => {
                batchEnd++;
                // Every "batchEnd" event should correspond to a "batchBegin" event, i.e.,
                // batchBegin and batchEnd should be equal.
                assert.strictEqual(batchBegin, batchEnd, "Received batchEnd without corresponding batchBegin");
            });

            deltaManager.attachOpHandler(0, 0, 1, {
                process(message: ISequencedDocumentMessage) {
                    processOp(message);
                    return {};
                },
                processSignal() { },
            });
        });

        afterEach(() => {
            batchBegin = 0;
            batchEnd = 0;
        });

        it("Batch messages that take longer than DeltaScheduler's processing time to process", async () => {
            await startDeltaManager();
            // Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
            // we will send more than one batch ops. This should ensure that the total processing will take more than
            // DeltaScheduler's processing time.
            const count = 2;
            const clientId: string = "test-client";

            const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
            // Add batch begin and batch end metadata to the messages.
            messages[0].metadata = { batch: true };
            messages[count - 1].metadata = { batch: false };
            await emitMessages(messages);

            // Batch messages are processed in a single turn. So, we should have received the batch events.
            assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
        });

        it("Non-batch messages that take longer than DeltaScheduler's processing time to process", async () => {
            await startDeltaManager();
            // Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
            // we will send more than one non-batch ops. This should ensure that we give up the JS turn after each
            // message is processed.
            const count = 2;
            const clientId: string = "test-client";
            let numberOfTurns = 1;

            const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
            await emitMessages(messages);

            // Non-batch messages should take more than one turn (`count` turns in this case). Keep yielding until we
            // get all the batch events.
            while (batchBegin < count) {
                numberOfTurns++;
                await yieldEventLoop();
            }

            // Assert that the processing should have happened in `count` turns.
            assert.strictEqual(numberOfTurns, count, "The processing should have taken more than one turn");

            // We should have received all the batch events.
            assert.strictEqual(count, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(count, batchEnd, "Did not receive correct batchEnd event for the batch");
        });

        it(`A non-batch message followed by batch messages that take longer than
            DeltaScheduler's processing time to process`, async () => {
            await startDeltaManager();
            // Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
            // we will send 1 non-batch op and more that one batch ops. This should ensure that we give up the JS turn
            // after the non-batch op is processed and then process the batch ops together in the next turn.
            const count = 3;
            const clientId: string = "test-client";

            const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
            // Add batch begin and batch end metadata to the messages.
            messages[1].metadata = { batch: true };
            messages[count - 1].metadata = { batch: false };
            await emitMessages(messages);

            // We should have received the batch events for the non-batch message in the first turn.
            assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");

            // Yield the event loop so that the batch messages can be processed.
            await yieldEventLoop();

            // We should have now received the batch events for the batch ops since they would have processed in
            // a single turn.
            assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(2, batchEnd, "Did not receive correct batchEnd event for the batch");
        });

        it(`Batch messages followed by a non-batch message that take longer than
            DeltaScheduler's processing time to process`, async () => {
            await startDeltaManager();
            // Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
            // we will send more that one batch ops and 1 non-batch op. This should ensure that we give up the JS turn
            // after the batch ops are processed and then process the non-batch op in the next turn.
            const count = 3;
            const clientId: string = "test-client";

            const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
            // Add batch begin and batch end metadata to the messages.
            messages[0].metadata = { batch: true };
            messages[count - 2].metadata = { batch: false };
            await emitMessages(messages);

            // We should have received the batch events for the batch messages in the first turn.
            assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");

            // Yield the event loop so that the single non-batch op can be processed.
            await yieldEventLoop();

            // We should have now received the batch events for the non-batch op since it would have processed in
            // a single turn.
            assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
            assert.strictEqual(2, batchEnd, "Did not receive correct batchEnd event for the batch");
        });
    });
});
