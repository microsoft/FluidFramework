/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockDocumentDeltaConnection, MockDocumentService } from "@fluid-private/test-loader-utils";
// eslint-disable-next-line import/no-internal-modules
import { ConnectionManager } from "@fluidframework/container-loader/internal/test/connectionManager";
// eslint-disable-next-line import/no-internal-modules
import { IConnectionManagerFactoryArgs } from "@fluidframework/container-loader/internal/test/contracts";
// eslint-disable-next-line import/no-internal-modules
import { DeltaManager } from "@fluidframework/container-loader/internal/test/deltaManager";
// eslint-disable-next-line import/no-internal-modules
import { DeltaScheduler } from "@fluidframework/container-runtime/internal/test/deltaScheduler";
// ADO:1981
// eslint-disable-next-line import/no-internal-modules
import { ScheduleManager } from "@fluidframework/container-runtime/internal/test/scheduleManager";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	ISequencedDocumentSystemMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import events_pkg from "events_pkg";
const { EventEmitter } = events_pkg;

describe("Container Runtime", () => {
	/**
	 * The following tests test the async processing model of ContainerRuntime -
	 * Batch messages are processed in a single turn no matter how long it takes to process them.
	 * Non-batch messages are processed in multiple turns if they take longer than DeltaScheduler's processingTime.
	 */
	describe("Async op processing", () => {
		let deltaManager: DeltaManager<ConnectionManager>;
		let scheduleManager: ScheduleManager;
		let deltaConnection: MockDocumentDeltaConnection;
		let seq: number;
		const docId = "docId";
		let batchBegin: number = 0;
		let batchEnd: number = 0;

		const startDeltaManager = async (): Promise<void> =>
			new Promise((resolve) => {
				deltaManager.on("connect", resolve);
				deltaManager.connect({ reason: { text: "test" } });
			});

		// Function to yield control in the Javascript event loop.
		async function yieldEventLoop(): Promise<void> {
			await new Promise<void>((resolve) => {
				setTimeout(resolve);
			});
		}

		async function emitMessages(messages: ISequencedDocumentMessage[]): Promise<void> {
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

		// Function to process an inbound op. It adds delay to simulate time taken in processing an op.
		function processOp(message: ISequencedDocumentMessage): void {
			scheduleManager.beforeOpProcessing(message);

			// Add delay such that each op takes greater than the DeltaScheduler's processing time to process.
			const processingDelay = DeltaScheduler.processingTime + 10;
			const startTime = Date.now();
			while (Date.now() - startTime < processingDelay) {}

			scheduleManager.afterOpProcessing(undefined, message);
			deltaManager.emit("op", message);
		}

		beforeEach(async () => {
			seq = 1;
			deltaConnection = new MockDocumentDeltaConnection("test");
			const service = new MockDocumentService(undefined, () => deltaConnection);
			const client: Partial<IClient> = {
				mode: "write",
				details: { capabilities: { interactive: true } },
			};

			deltaManager = new DeltaManager<ConnectionManager>(
				() => service,
				createChildLogger({ namespace: "fluid:testDeltaManager" }),
				() => false,
				(props: IConnectionManagerFactoryArgs) =>
					new ConnectionManager(
						() => service,
						() => false,
						client as IClient,
						false,
						createChildLogger({ namespace: "fluid:testConnectionManager" }),
						props,
					),
			);

			const emitter = new EventEmitter();
			scheduleManager = new ScheduleManager(
				deltaManager,
				emitter,
				() => "test-client", // clientId,
				createChildLogger({ namespace: "fluid:testScheduleManager" }),
			);

			emitter.on("batchBegin", () => {
				// When we receive a "batchBegin" event, we should not have any outstanding
				// events, i.e., batchBegin and batchEnd should be equal.
				assert.strictEqual(
					batchBegin,
					batchEnd,
					"Received batchBegin before previous batchEnd",
				);
				batchBegin++;
			});

			emitter.on("batchEnd", () => {
				batchEnd++;
				// Every "batchEnd" event should correspond to a "batchBegin" event, i.e.,
				// batchBegin and batchEnd should be equal.
				assert.strictEqual(
					batchBegin,
					batchEnd,
					"Received batchEnd without corresponding batchBegin",
				);
			});

			await deltaManager.attachOpHandler(0, 0, {
				process(message: ISequencedDocumentMessage) {
					processOp(message);
					return {};
				},
				processSignal() {},
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
			assert.strictEqual(
				1,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
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
			assert.strictEqual(
				numberOfTurns,
				count,
				"The processing should have taken more than one turn",
			);

			// We should have received all the batch events.
			assert.strictEqual(
				count,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(
				count,
				batchEnd,
				"Did not receive correct batchEnd event for the batch",
			);
		});

		it(`A non-batch message followed by batch messages that take longer than
            DeltaScheduler's processing time to process`, async () => {
			await startDeltaManager();
			// Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
			// we will send 1 non-batch op and more than one batch ops. This should ensure that we give up the JS turn
			// after the non-batch op is processed and then process the batch ops together in the next turn.
			const count = 3;
			const clientId: string = "test-client";

			const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
			// Add batch begin and batch end metadata to the messages.
			messages[1].metadata = { batch: true };
			messages[count - 1].metadata = { batch: false };
			await emitMessages(messages);

			// We should have received the batch events for the non-batch message in the first turn.
			assert.strictEqual(
				1,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");

			// Yield the event loop so that the batch messages can be processed.
			await yieldEventLoop();

			// We should have now received the batch events for the batch ops since they would have processed in
			// a single turn.
			assert.strictEqual(
				2,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(2, batchEnd, "Did not receive correct batchEnd event for the batch");
		});

		it(`Batch messages followed by a non-batch message that take longer than
            DeltaScheduler's processing time to process`, async () => {
			await startDeltaManager();
			// Since each message takes more than DeltaScheduler.processingTime to process (see processOp above),
			// we will send more than one batch ops and 1 non-batch op. This should ensure that we give up the JS turn
			// after the batch ops are processed and then process the non-batch op in the next turn.
			const count = 3;
			const clientId: string = "test-client";

			const messages: ISequencedDocumentMessage[] = getMessages(clientId, count);
			// Add batch begin and batch end metadata to the messages.
			messages[0].metadata = { batch: true };
			messages[count - 2].metadata = { batch: false };
			await emitMessages(messages);

			// We should have received the batch events for the batch messages in the first turn.
			assert.strictEqual(
				1,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");

			// Yield the event loop so that the single non-batch op can be processed.
			await yieldEventLoop();

			// We should have now received the batch events for the non-batch op since it would have processed in
			// a single turn.
			assert.strictEqual(
				2,
				batchBegin,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(2, batchEnd, "Did not receive correct batchEnd event for the batch");
		});

		it("Reconnects after receiving a leave op", async () => {
			let deltaConnection2 = new MockDocumentDeltaConnection("test");
			const service2 = new MockDocumentService(undefined, (newClient?: IClient) => {
				deltaConnection2 = new MockDocumentDeltaConnection("test");
				deltaConnection2.mode = newClient?.mode ?? "write";
				return deltaConnection2;
			});

			const client = { mode: "write", details: { capabilities: { interactive: true } } };

			const deltaManager2 = new DeltaManager<ConnectionManager>(
				() => service2,
				createChildLogger({ namespace: "fluid:testDeltaManager" }),
				() => true,
				(props: IConnectionManagerFactoryArgs) =>
					new ConnectionManager(
						() => service2,
						() => false,
						client as IClient,
						true,
						createChildLogger({ namespace: "fluid:testConnectionManager" }),
						props,
					),
			);
			await deltaManager2.attachOpHandler(0, 0, {
				process(message: ISequencedDocumentMessage) {
					processOp(message);
					return {};
				},
				processSignal() {},
			});
			await new Promise((resolve) => {
				deltaManager2.on("connect", resolve);
				deltaManager2.connect({ reason: { text: "test" } });
			});

			assert.strictEqual(
				deltaManager2.connectionManager.connectionMode,
				"write",
				"connection mode should be write",
			);

			const leaveMessage: ISequencedDocumentSystemMessage = {
				clientId: "null",
				data: `"${deltaManager2.connectionManager.clientId}"`,
				minimumSequenceNumber: 0,
				sequenceNumber: seq++,
				type: MessageType.ClientLeave,
				clientSequenceNumber: 1,
				referenceSequenceNumber: 1,
				contents: "",
				timestamp: 1,
			};

			deltaConnection2.emitOp(docId, [leaveMessage]);
			await new Promise((resolve) => {
				deltaManager2.on("connect", resolve);
			});

			assert.strictEqual(
				deltaManager2.connectionManager.connectionMode,
				"read",
				"new connection should be in read mode",
			);
		});
	});
});
