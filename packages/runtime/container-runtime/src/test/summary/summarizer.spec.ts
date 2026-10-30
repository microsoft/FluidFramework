/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions/internal";
import type { SummarizerStopReason } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils/internal";
import sinon from "sinon";

import { opSize } from "../../opProperties.js";
import {
	type ICancellableSummarizerController,
	Summarizer,
	SummaryCollection,
	type ISummarizeHeuristicData,
	type ISummarizerRuntime,
	type ISummarizerInternalsProvider,
	type ISummaryConfigurationHeuristics,
	type SubmitSummaryResult,
} from "../../summary/index.js";

describe("Runtime", () => {
	describe("Summarization", () => {
		describe("Summarizer", () => {
			for (const trigger of ["maxTime", "maxOps"] as const) {
				it(`starts automatic ${trigger} scheduling from the correct time and catch-up counts`, async () => {
					const clock = sinon.useFakeTimers();
					const deltaManager = new MockDeltaManager();
					const logger = new MockLogger();
					const stopped = new Deferred<SummarizerStopReason>();
					const coordinator: ICancellableSummarizerController = {
						cancelled: false,
						waitCancelled: stopped.promise,
						stop: (reason) => stopped.resolve(reason),
					};
					const runtime = Object.assign(new TypedEventEmitter<IContainerRuntimeEvents>(), {
						deltaManager,
						baseLogger: logger,
						clientId: "summarizer",
						disposeFn: () => {},
					});
					const configuration: ISummaryConfigurationHeuristics = {
						state: "enabled",
						maxTime: 1000,
						maxOps: trigger === "maxOps" ? 2 : 100,
						minOpsForLastSummaryAttempt: 100,
						minIdleTime: 10000,
						maxIdleTime: 10000,
						runtimeOpWeight: 1,
						nonRuntimeOpWeight: 0.1,
						maxAckWaitTime: 20000,
						maxOpsSinceLastSummary: 7000,
						initialSummarizerDelayMs: 0,
					};
					let submitCount = 0;
					const submitted = new Deferred<void>();
					const submitResult = new Deferred<SubmitSummaryResult>();
					const summarizer = new Summarizer(
						runtime as unknown as ISummarizerRuntime,
						() => configuration,
						{
							submitSummary: async () => {
								submitCount++;
								submitted.resolve();
								return submitResult.promise;
							},
							refreshLatestSummaryAck: async () => {},
						},
						{} as unknown as IFluidHandleContext,
						new SummaryCollection(deltaManager, logger),
						async () => coordinator,
					);
					let runP: Promise<SummarizerStopReason> | undefined;
					try {
						// Simulate a slow load, then three catch-up ops sharing one server sequence.
						clock.tick(5000);
						const op = {
							sequenceNumber: 1,
							type: MessageType.Operation,
						} as unknown as ISequencedDocumentMessage;
						for (let i = 0; i < 3; i++) {
							runtime.emit("op", op, true);
						}
						// Exercise the automatic run() path, not summarizeOnDemand().
						runP = summarizer.run("parent");
						await clock.tickAsync(0);
						if (trigger === "maxTime") {
							assert.equal(submitCount, 0, "load time must not trigger maxTime on startup");
							await clock.tickAsync(configuration.maxTime);
							assert.equal(submitCount, 0);
							clock.tick(1);
							runtime.emit("op", { ...op, sequenceNumber: 2 }, true);
							await clock.tickAsync(0);
						}
						await submitted.promise;
						assert.equal(
							submitCount,
							1,
							"catch-up ops must participate in automatic scheduling",
						);
						logger.assertMatchAny([
							{ eventName: "Summarizer:Running:Summarize_start", summarizeReason: trigger },
						]);
					} finally {
						coordinator.stop("summarizerClientDisconnected");
						submitResult.reject(new Error("test shutdown"));
						await runP;
						summarizer.dispose();
						clock.restore();
					}
				});
			}

			it("counts grouped ops before startup and stops observing on disposal", () => {
				const deltaManager = new MockDeltaManager();
				const logger = new MockLogger();
				const runtime = Object.assign(new TypedEventEmitter<IContainerRuntimeEvents>(), {
					deltaManager,
					baseLogger: logger,
				});
				const summarizer = new Summarizer(
					runtime as unknown as ISummarizerRuntime,
					() => ({ state: "disabled" }),
					{} as unknown as ISummarizerInternalsProvider,
					{} as unknown as IFluidHandleContext,
					new SummaryCollection(deltaManager, logger),
					async () => {
						throw new Error("must not start the coordinator");
					},
				);
				const data = (summarizer as unknown as { _heuristicData: ISummarizeHeuristicData })
					._heuristicData;
				const op = {
					sequenceNumber: 1,
					type: MessageType.Operation,
					contents: { value: "catch-up" },
				} as unknown as ISequencedDocumentMessage;
				for (let i = 0; i < 3; i++) {
					runtime.emit("op", op, true);
				}
				const nonRuntimeOp = { ...op, sequenceNumber: 2, type: MessageType.NoOp };
				runtime.emit("op", nonRuntimeOp, false);
				summarizer.recordSummaryAttempt?.();
				assert.equal(data.numRuntimeOps, 3);
				assert.equal(data.numNonRuntimeOps, 1);
				assert.equal(data.opsSinceLastSummary, 4);
				assert.equal(data.lastAttempt.refSequenceNumber, 2);
				assert.equal(data.totalOpsSize, 3 * opSize(op) + opSize(nonRuntimeOp));
				assert.equal(data.hasMissingOpData, false);
				summarizer.dispose();
				runtime.emit("op", op, true);
				assert.equal(data.numRuntimeOps, 3);
				assert.equal(data.lastOpSequenceNumber, 2);
			});

			it("Should not run last summary when reason is not parentNotConnected", () => {
				const stopReasons: SummarizerStopReason[] = [
					"failToSummarize",
					"notElectedParent",
					"notElectedClient",
					"summarizerClientDisconnected",
					"summarizerException",
				];

				// This doesn't prevent future stop reason additions, but it's a good baseline
				for (const stopReason of stopReasons) {
					assert(
						Summarizer.stopReasonCanRunLastSummary(stopReason) === false,
						"should not run last summary when stop reason is not parentNotConnected",
					);
				}
			});

			it("Should run last summary when reason is parentNotConnected", () => {
				assert(
					Summarizer.stopReasonCanRunLastSummary("parentNotConnected") === true,
					"should run last summary when stop reason is parentNotConnected",
				);
			});
		});
	});
});
