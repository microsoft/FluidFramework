/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { EventEmitter } from "@fluid-internal/client-utils";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluid-private/test-loader-utils";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaStorageService,
	IDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	MockLogger,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import { ConnectionManager } from "../connectionManager.js";
import { IConnectionManagerFactoryArgs } from "../contracts.js";
import { DeltaManager } from "../deltaManager.js";
import { NoopHeuristic } from "../noopHeuristic.js";

describe("Loader", () => {
	describe("Container Loader", () => {
		describe("Delta Manager", () => {
			let clock: SinonFakeTimers;
			let deltaManager: DeltaManager<ConnectionManager>;
			let logger: ITelemetryLoggerExt;
			let deltaConnection: MockDocumentDeltaConnection;
			let clientSeqNumber = 0;
			let emitter: EventEmitter;
			let seq: number;
			let expectedError: any;
			const docId = "docId";
			const submitEvent = "test-submit";
			const expectedTimeout = 2000;
			const noopCountFrequency = 300;
			// Stash the real setTimeout because sinon fake timers will hijack it.
			const realSetTimeout = setTimeout;

			async function startDeltaManager(
				reconnectAllowed = true,
				dmLogger: ITelemetryLoggerExt = logger,
				deltaStorageFactory?: () => IDocumentDeltaStorageService,
			) {
				const service = new MockDocumentService(deltaStorageFactory, () => {
					// Always create new connection, as reusing old closed connection
					// Forces DM into infinite reconnection loop.
					deltaConnection = new MockDocumentDeltaConnection("test", (messages) =>
						emitter.emit(submitEvent, messages),
					);
					return deltaConnection;
				});
				const client: Partial<IClient> = {
					mode: "write",
					details: { capabilities: { interactive: true } },
				};

				deltaManager = new DeltaManager<ConnectionManager>(
					() => service,
					dmLogger,
					() => false,
					(props: IConnectionManagerFactoryArgs) =>
						new ConnectionManager(
							() => service,
							() => false,
							client as IClient,
							reconnectAllowed,
							dmLogger,
							props,
						),
				);

				const noopHeuristic = new NoopHeuristic(expectedTimeout, noopCountFrequency);

				noopHeuristic.on("wantsNoop", () => {
					deltaManager.submit(MessageType.NoOp);
					noopHeuristic.notifyMessageSent();
				});

				await deltaManager.attachOpHandler(0, 0, {
					process: (message) => noopHeuristic.notifyMessageProcessed(message),
					processSignal() {},
				});

				await new Promise((resolve) => {
					deltaManager.on("connect", resolve);
					deltaManager.connect({ reason: { text: "test" } });
				});
			}

			// function to yield control in the Javascript event loop.
			async function yieldEventLoop(): Promise<void> {
				await new Promise<void>((resolve) => {
					realSetTimeout(resolve, 0);
				});
			}

			function generateOp(
				type: MessageType = MessageType.Operation,
			): ISequencedDocumentMessage {
				return {
					clientId: "Some client ID",
					clientSequenceNumber: ++clientSeqNumber,
					minimumSequenceNumber: 0,
					sequenceNumber: seq++,
					type,
				} as any as ISequencedDocumentMessage;
			}

			async function sendAndReceiveOps(count: number, type: MessageType) {
				for (let num = 0; num < count; ++num) {
					assert(!deltaConnection.disposed, "disposed");
					deltaManager.submit(type);
					deltaConnection.emitOp(docId, [
						{
							clientId: "test",
							clientSequenceNumber: ++clientSeqNumber,
							minimumSequenceNumber: 0,
							sequenceNumber: seq++,
							type,
						} as any as ISequencedDocumentMessage,
					]);
				}

				// Yield the event loop because the inbound op will be processed asynchronously.
				await yieldEventLoop();
			}

			async function emitSequentialOps(count: number) {
				for (let num = 0; num < count; ++num) {
					assert(!deltaConnection.disposed, "disposed");
					deltaConnection.emitOp(docId, [generateOp()]);
				}

				// Yield the event loop because the inbound op will be processed asynchronously.
				await yieldEventLoop();
			}

			async function tickClock(tickValue: number) {
				clock.tick(tickValue);

				// Yield the event loop because the outbound op will be processed asynchronously.
				await yieldEventLoop();
			}

			const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));

			before(() => {
				clock = useFakeTimers();
			});

			beforeEach(async () => {
				seq = 1;
				logger = createChildLogger({ namespace: "fluid:testDeltaManager" });
				emitter = new EventEmitter();

				clientSeqNumber = 0;
				expectedError = undefined;
			});

			afterEach(() => {
				clock.reset();
			});

			after(() => {
				clock.restore();
			});

			describe("Update Minimum Sequence Number", () => {
				// helper function asserting that there is exactly one well-formed no-op
				function assertOneValidNoOp(messages: IDocumentMessage[]) {
					assert.strictEqual(1, messages.length);
					assert.strictEqual(MessageType.NoOp, messages[0].type);
					assert.strictEqual(undefined, messages[0].contents);
				}

				it("Infinite frequency parameters disables periodic noops completely", async () => {
					const noopHeuristic = new NoopHeuristic(Infinity, Infinity);

					noopHeuristic.on("wantsNoop", () => {
						assert.fail("Heuristic shouldn't request noops with Infinite thresholds");
					});

					for (let num = 0; num < 1000; ++num) {
						noopHeuristic.notifyMessageProcessed(generateOp());
					}

					await tickClock(1000 * 1000);
				});

				it("Infinite time frequency will not generate noops at time intervals", async () => {
					let counter = 0;
					const noopHeuristic = new NoopHeuristic(Infinity, 100);
					noopHeuristic.on("wantsNoop", () => {
						counter++;
						noopHeuristic.notifyMessageSent();
					});
					for (let num = 0; num < 99; ++num) {
						noopHeuristic.notifyMessageProcessed(generateOp());
					}
					await tickClock(1000 * 1000);
					assert.equal(counter, 0, "No noops requested after 99 ops");
					noopHeuristic.notifyMessageProcessed(generateOp());
					await tickClock(1);
					assert.equal(counter, 1, "One noop should be requested");
				});

				it("Infinite op frequency will not generate noops at op intervals", async () => {
					let counter = 0;
					const noopHeuristic = new NoopHeuristic(100, Infinity);
					noopHeuristic.on("wantsNoop", () => {
						counter++;
						noopHeuristic.notifyMessageSent();
					});
					for (let num = 0; num < 1000; ++num) {
						noopHeuristic.notifyMessageProcessed(generateOp());
					}
					assert.equal(counter, 0, "No noops requested after 99 ops");
					await tickClock(100);
					assert.equal(counter, 1, "One noop should be requested");
				});

				it("1k op frequency will generate noop at op intervals", async () => {
					let counter = 0;
					const noopHeuristic = new NoopHeuristic(Infinity, 1000);
					noopHeuristic.on("wantsNoop", () => {
						counter++;
						noopHeuristic.notifyMessageSent();
					});
					for (let num = 0; num < 1000; ++num) {
						noopHeuristic.notifyMessageProcessed(generateOp());
					}
					assert.equal(counter, 0, "No noops requested after 999 ops");
					await tickClock(1);
					assert.equal(counter, 1, "One noop should be requested");
				});

				it("Should update after op count threshold", async () => {
					let runCount = 0;
					await startDeltaManager();
					emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
						assertOneValidNoOp(messages);
						runCount++;
					});

					await emitSequentialOps(noopCountFrequency - 1);
					await tickClock(expectedTimeout - 1);
					assert.strictEqual(runCount, 0);

					await emitSequentialOps(1);
					assert.strictEqual(runCount, 1);

					await emitSequentialOps(noopCountFrequency - 1);
					await tickClock(expectedTimeout - 1);
					assert.strictEqual(runCount, 1);
				});

				it("Should update after time threshold reached", async () => {
					let runCount = 0;

					await startDeltaManager();
					emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
						assertOneValidNoOp(messages);
						runCount++;
					});

					await emitSequentialOps(noopCountFrequency - 1);
					await tickClock(expectedTimeout - 1);
					assert.strictEqual(runCount, 0);

					// should run after timeout
					await tickClock(1);
					assert.strictEqual(runCount, 1);

					// Now timeout again should not cause noop
					await tickClock(expectedTimeout);
					await emitSequentialOps(noopCountFrequency - 1);
					assert.strictEqual(runCount, 1);
				});

				it("Should not update when receiving just no-ops even after timeout", async () => {
					await startDeltaManager();
					emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
						assertOneValidNoOp(messages);
						assert.fail("Should not send no-op.");
					});

					await emitSequentialOps(noopCountFrequency + 1);
					await tickClock(expectedTimeout);
				});

				it("Should not update if op submitted during timeout", async () => {
					const ignoreContent = "ignoreThisMessage";
					let canIgnore = true;
					await startDeltaManager();

					emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
						// we can ignore our own op
						if (
							messages.length === 1 &&
							messages[0].type === MessageType.Operation &&
							messages[0].contents !== undefined &&
							JSON.parse(messages[0].contents as string) === ignoreContent &&
							canIgnore
						) {
							canIgnore = false;
							return;
						}
						assert.fail("Should not send no-op.");
					});

					await emitSequentialOps(1);
					await tickClock(expectedTimeout - 1);
					deltaManager.submit(MessageType.Operation, ignoreContent);
					await tickClock(1);

					// make extra sure
					await tickClock(expectedTimeout);
				});

				it("Should throw error with gap in client seq num", async () => {
					await startDeltaManager();

					deltaManager.inbound.on("error", (error) => {
						expectedError = error;
					});

					await sendAndReceiveOps(1, MessageType.Operation);

					// send op with gap in clientSeqNum
					deltaConnection.emitOp(docId, [
						{
							clientId: "test",
							clientSequenceNumber: clientSeqNumber + 2,
							minimumSequenceNumber: 0,
							sequenceNumber: seq++,
							type: MessageType.Operation,
						} as any as ISequencedDocumentMessage,
					]);

					await yieldEventLoop();
					assert.strictEqual(expectedError.message, "gap in client sequence number: 1");
				});

				it("Should pass with one noop sent, 0 received and one gap", async () => {
					await startDeltaManager();

					deltaManager.inbound.on("error", (error) => {
						expectedError = error;
					});

					await sendAndReceiveOps(1, MessageType.Operation);

					// send 1 noop without receiving
					deltaManager.submit(MessageType.NoOp);

					// send op with gap in clientSeqNum
					deltaManager.submit(MessageType.Operation);
					deltaConnection.emitOp(docId, [
						{
							clientId: "test",
							clientSequenceNumber: clientSeqNumber + 2,
							minimumSequenceNumber: 0,
							sequenceNumber: seq,
							type: MessageType.Operation,
						} as any as ISequencedDocumentMessage,
					]);

					await yieldEventLoop();
					assert.strictEqual(
						deltaManager.lastMessage?.sequenceNumber,
						seq,
						"discrepancy in last processed seqNum",
					);
					assert.strictEqual(
						expectedError,
						undefined,
						`Error should not happen : ${expectedError}`,
					);
				});

				it("Should throw error with one noop sent and received, gap = 1", async () => {
					await startDeltaManager();

					deltaManager.inbound.on("error", (error) => {
						expectedError = error;
					});

					await sendAndReceiveOps(1, MessageType.Operation);
					await sendAndReceiveOps(1, MessageType.NoOp);

					// send op with gap in clientSeqNum
					deltaConnection.emitOp(docId, [
						{
							clientId: "test",
							clientSequenceNumber: clientSeqNumber + 2,
							minimumSequenceNumber: 0,
							sequenceNumber: seq,
							type: MessageType.Operation,
						} as any as ISequencedDocumentMessage,
					]);

					await yieldEventLoop();
					assert.strictEqual(expectedError.message, "gap in client sequence number: 1");
				});

				it("Should pass with 2 noop sent, 1 received, gap = 1", async () => {
					await startDeltaManager();
					deltaManager.inbound.on("error", (error) => {
						expectedError = error;
					});

					await sendAndReceiveOps(1, MessageType.Operation);
					await sendAndReceiveOps(1, MessageType.NoOp);

					// send second noop, without receiving
					deltaManager.submit(MessageType.NoOp);

					// send op with gap in clientSeqNum
					deltaManager.submit(MessageType.Operation);
					deltaConnection.emitOp(docId, [
						{
							clientId: "test",
							clientSequenceNumber: clientSeqNumber + 2,
							minimumSequenceNumber: 0,
							sequenceNumber: seq,
							type: MessageType.Operation,
						} as any as ISequencedDocumentMessage,
					]);

					await yieldEventLoop();
					assert.strictEqual(
						deltaManager.lastMessage?.sequenceNumber,
						seq,
						"discrepancy in last processed seqNum",
					);
					assert.strictEqual(
						expectedError,
						undefined,
						`Error should not happen : ${expectedError}`,
					);
				});
			});

			describe("Readonly API", () => {
				it("Should override readonly", async () => {
					await startDeltaManager();

					// TS 5.1.6: Workaround 'TS2339: Property 'readonly' does not exist on type 'never'.'
					//
					//           After observering that 'forceReadonly' has been asserted to be both true and
					//           false, TypeScript coerces 'connectionManager' to 'never'.  Wrapping the
					//           assertion in lambda avoids this.
					const assertReadonlyIs = (expected: boolean) => {
						assert.strictEqual(deltaManager.readOnlyInfo.readonly, expected);
					};

					assertReadonlyIs(false);

					deltaManager.connectionManager.forceReadonly(true);
					assertReadonlyIs(true);

					deltaManager.connectionManager.forceReadonly(false);
					assertReadonlyIs(false);
				});

				it("Should raise readonly event when container was not readonly", async () => {
					await startDeltaManager();
					let runCount = 0;

					deltaManager.on("readonly", (readonly: boolean) => {
						assert.strictEqual(readonly, true);
						runCount++;
					});

					deltaManager.connectionManager.forceReadonly(true);
					assert.strictEqual(runCount, 1);
				});

				it("Shouldn't raise readonly event when container was already readonly", async () => {
					await startDeltaManager(false /* startDeltaManager */);

					// Closing underlying connection makes container readonly
					deltaConnection.dispose();
					assert.strictEqual(deltaManager.readOnlyInfo.readonly, true);

					deltaManager.on("readonly", () => {
						assert.fail("Shouldn't be called");
					});

					deltaManager.connectionManager.forceReadonly(true);
				});
			});

			it("Closed abort reason should be passed fetch abort signal", async () => {
				const mockLogger = new MockLogger();
				await startDeltaManager(undefined, mockLogger.toTelemetryLogger(), () => ({
					fetchMessages: (
						_from: number,
						_to: number | undefined,
						abortSignal?: AbortSignal,
						_cachedOnly?: boolean,
					) => {
						return {
							read: async () => {
								await new Promise<void>((resolve) => {
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									abortSignal!.onabort = () => {
										resolve();
									};
								});

								throw new Error(abortSignal?.reason);
							},
						};
					},
				}));

				// Dispose will trigger abort
				deltaManager.dispose();
				await flushPromises();

				mockLogger.assertMatch([
					{
						eventName: "DeltaManager_GetDeltasAborted",
						reason: "DeltaManager is closed",
					},
					{
						eventName: "GetDeltas_Exception",
						error: "DeltaManager is closed",
					},
				]);
			});
		});
	});
});
