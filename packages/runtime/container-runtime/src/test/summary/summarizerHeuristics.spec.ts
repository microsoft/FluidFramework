/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import sinon from "sinon";

import {
	ISummaryConfiguration,
	ISummaryConfigurationHeuristics,
} from "../../containerRuntime.js";
import {
	ISummarizeAttempt,
	ISummarizeHeuristicData,
	SummarizeHeuristicData,
	SummarizeHeuristicRunner,
	SummarizeReason,
} from "../../summary/index.js";

describe("Runtime", () => {
	describe("Summarization", () => {
		describe("Summarize Heuristic Runner", () => {
			let clock: sinon.SinonFakeTimers;
			before(() => {
				clock = sinon.useFakeTimers();
			});
			after(() => {
				clock.restore();
			});

			const defaultSummaryConfig: ISummaryConfigurationHeuristics = {
				state: "enabled",
				maxTime: 5000 * 12, // 1 min (active)
				maxOps: 1000, // 1k ops (active)
				minOpsForLastSummaryAttempt: 50,
				maxAckWaitTime: 120000, // 2 min
				maxOpsSinceLastSummary: 7000,
				initialSummarizerDelayMs: 0,
				minIdleTime: 5000, // 5 sec (idle)
				maxIdleTime: 5000, // 5 sec (idle)
				nonRuntimeOpWeight: 0.1,
				runtimeOpWeight: 1,
			};
			let summaryConfig: Readonly<ISummaryConfiguration>;
			let data: ISummarizeHeuristicData;
			let runner: SummarizeHeuristicRunner;
			let mockLogger: MockLogger;

			let attempts: SummarizeReason[];
			const trySummarize = (reason: SummarizeReason) => {
				attempts.push(reason);
			};
			const getLastAttempt = () =>
				attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
			function assertAttemptCount(count: number, message?: string) {
				const fullMessage = `${attempts.length} !== ${count}; ${
					message ?? "unexpected attempt count"
				}`;
				assert(attempts.length === count, fullMessage);
			}

			function initialize({
				refSequenceNumber = 0,
				lastOpSequenceNumber = refSequenceNumber,
				summaryTime = Date.now(),
				maxTime = defaultSummaryConfig.maxTime,
				maxOps = defaultSummaryConfig.maxOps,
				maxAckWaitTime = defaultSummaryConfig.maxAckWaitTime,
				maxOpsSinceLastSummary = defaultSummaryConfig.maxOpsSinceLastSummary,
				initialSummarizerDelayMs = defaultSummaryConfig.initialSummarizerDelayMs,
				minOpsForLastSummaryAttempt = defaultSummaryConfig.minOpsForLastSummaryAttempt,
				run = true,
				minIdleTime = defaultSummaryConfig.minIdleTime,
				maxIdleTime = defaultSummaryConfig.maxIdleTime,
				nonRuntimeOpWeight = defaultSummaryConfig.nonRuntimeOpWeight,
				runtimeOpWeight = defaultSummaryConfig.runtimeOpWeight,
			}: Partial<
				ISummaryConfigurationHeuristics &
					ISummarizeAttempt & {
						lastOpSequenceNumber: number;
						run: boolean;
					}
			> = {}) {
				mockLogger = new MockLogger();
				data = new SummarizeHeuristicData(lastOpSequenceNumber, {
					refSequenceNumber,
					summaryTime,
				});
				summaryConfig = {
					state: "enabled",
					maxTime,
					maxOps,
					maxAckWaitTime,
					maxOpsSinceLastSummary,
					initialSummarizerDelayMs,
					minOpsForLastSummaryAttempt,
					minIdleTime,
					maxIdleTime,
					nonRuntimeOpWeight,
					runtimeOpWeight,
				} as const;

				runner = new SummarizeHeuristicRunner(
					data,
					summaryConfig,
					trySummarize,
					mockLogger.toTelemetryLogger(),
				);

				if (run) {
					runner.run();
				}
			}

			beforeEach(() => {
				attempts = [];
			});
			afterEach(() => {
				clock.reset();
			});

			it("Should summarize after maxOps with no prior summary", () => {
				const maxOps = 100;
				initialize({ maxOps });

				data.lastOpSequenceNumber = maxOps;
				data.numRuntimeOps = maxOps;
				runner.run();
				assertAttemptCount(0, "should not run yet");

				data.lastOpSequenceNumber++;
				data.numRuntimeOps++;
				runner.run();
				assertAttemptCount(1, "should run now");
				assert(getLastAttempt() === "maxOps");
			});

			it("Should summarize after maxOps", () => {
				const lastSummary = 1000;
				const maxOps = 100;
				initialize({ refSequenceNumber: lastSummary, maxOps });

				data.lastOpSequenceNumber = lastSummary + maxOps;
				data.numRuntimeOps = maxOps;
				runner.run();
				assertAttemptCount(0, "should not run yet");

				data.lastOpSequenceNumber++;
				data.numRuntimeOps++;
				runner.run();
				assertAttemptCount(1, "should run now");
				assert(getLastAttempt() === "maxOps");
			});

			it("Should summarize after maxTime", () => {
				const lastSummary = 1000;
				const idleTime = 101;
				const maxTime = 1000;
				const idlesPerActive = Math.floor((maxTime + 1) / (idleTime - 1));
				const remainingTime = (maxTime + 1) % (idleTime - 1);
				initialize({
					refSequenceNumber: lastSummary,
					minIdleTime: idleTime,
					maxIdleTime: idleTime,
					maxTime,
				});

				data.lastOpSequenceNumber = lastSummary + 1;

				for (let i = 0; i < idlesPerActive; i++) {
					// Prevent idle timer from triggering with periodic "ops" (heuristic runs)
					clock.tick(idleTime - 1);
					runner.run();
				}
				clock.tick(remainingTime - 1);
				runner.run();
				assertAttemptCount(0, "should not run yet");

				clock.tick(1);
				runner.run();
				assertAttemptCount(1, "should run now");
				assert(getLastAttempt() === "maxTime");
			});

			it("Should summarize after idleTime", () => {
				const lastSummary = 1000;
				const idleTime = 101;
				const maxTime = 1000;
				initialize({
					refSequenceNumber: lastSummary,
					minIdleTime: idleTime,
					maxIdleTime: idleTime,
					maxTime,
				});

				data.lastOpSequenceNumber = lastSummary + 1;

				clock.tick(idleTime - 1);
				assertAttemptCount(0, "should not run yet");

				clock.tick(1);
				assertAttemptCount(1, "should run now");
				assert(getLastAttempt() === "idle");
			});

			it("Should summarize after idleTime after a few interruptions", () => {
				const lastSummary = 1000;
				const idleTime = 101;
				const maxTime = 1000;
				initialize({
					refSequenceNumber: lastSummary,
					minIdleTime: idleTime,
					maxIdleTime: idleTime,
					maxTime,
				});

				data.lastOpSequenceNumber = lastSummary + 1;

				clock.tick(idleTime - 1);
				assertAttemptCount(0, "should not run yet");
				runner.run(); // interrupts idle timer

				clock.tick(idleTime - 1);
				assertAttemptCount(0, "still should not run yet");
				runner.run(); // interrupts idle timer

				clock.tick(idleTime - 1);
				assertAttemptCount(0, "still should not run yet again");

				clock.tick(idleTime);
				assertAttemptCount(1, "should run now");
				assert(getLastAttempt() === "idle");
			});

			it("Should summarize on close if enough outstanding ops", () => {
				const minOpsForLastSummaryAttempt = 10;
				initialize({ minOpsForLastSummaryAttempt, runtimeOpWeight: 1 });

				data.numRuntimeOps = minOpsForLastSummaryAttempt;
				assert.strictEqual(runner.shouldRunLastSummary(), true, "should run on close");
			});

			it("Should not summarize on close if insufficient outstanding ops", () => {
				const minOpsForLastSummaryAttempt = 10;
				initialize({ minOpsForLastSummaryAttempt, runtimeOpWeight: 1 });

				data.numRuntimeOps = minOpsForLastSummaryAttempt - 1;
				assert.strictEqual(runner.shouldRunLastSummary(), false, "should not run on close");
			});

			it("Should summarize on close weights ops properly", () => {
				const minOpsForLastSummaryAttempt = 2;
				initialize({
					minOpsForLastSummaryAttempt,
					runtimeOpWeight: 0.1,
					nonRuntimeOpWeight: 1.1,
				});

				data.numRuntimeOps += 8;
				assert.strictEqual(runner.shouldRunLastSummary(), false, "should not run yet");

				data.numNonRuntimeOps += 1;
				assert.strictEqual(runner.shouldRunLastSummary(), false, "should not run yet");

				data.numRuntimeOps += 1;
				assert.strictEqual(runner.shouldRunLastSummary(), true, "should run");
			});

			it("Should not run idle timer after dispose", () => {
				const lastSummary = 1000;
				const idleTime = 101;
				const maxTime = 1000;
				initialize({
					refSequenceNumber: lastSummary,
					minIdleTime: idleTime,
					maxIdleTime: idleTime,
					maxTime,
				});

				data.lastOpSequenceNumber = lastSummary + 1;

				clock.tick(idleTime - 1);
				runner.run();
				assertAttemptCount(0, "should not run yet");

				runner.dispose();
				clock.tick(1);
				runner.run();
				assertAttemptCount(0, "should still run since disposed");
			});

			it("Idle time value should change based on op counts", () => {
				const minIdleTime = 0;
				const maxIdleTime = 1;
				const maxTime = 1000;
				const maxOps = 1000;
				const runtimeOpWeight = 1;
				const nonRuntimeOpWeight = 1;
				initialize({
					minIdleTime,
					maxIdleTime,
					maxTime,
					maxOps,
					runtimeOpWeight,
					nonRuntimeOpWeight,
				});

				data.lastOpSequenceNumber = maxOps;
				assert.strictEqual(runner.idleTime, maxIdleTime, "should start at the maxIdleTime");

				data.numRuntimeOps += 50;
				assert.strictEqual(runner.idleTime, maxIdleTime - 0.05);

				data.numRuntimeOps += 123;
				assert.strictEqual(runner.idleTime, maxIdleTime - 0.173);

				data.numRuntimeOps += 500;
				assert.strictEqual(runner.idleTime, maxIdleTime - 0.673);

				data.numRuntimeOps += 326;
				assert.strictEqual(runner.idleTime, maxIdleTime - 0.999);

				data.numRuntimeOps += 1;
				assert.strictEqual(runner.idleTime, minIdleTime);

				data.numRuntimeOps += 100;
				assert.strictEqual(
					runner.idleTime,
					minIdleTime,
					"should never go below the minIdleTime",
				);
			});

			it("Idle time should change based on op weights", () => {
				const minIdleTime = 0;
				const maxIdleTime = 1000;
				const maxTime = 1000;
				const maxOps = 1000;
				const runtimeOpWeight = 0.1;
				const nonRuntimeOpWeight = 1.1;
				initialize({
					minIdleTime,
					maxIdleTime,
					maxTime,
					maxOps,
					runtimeOpWeight,
					nonRuntimeOpWeight,
				});

				data.lastOpSequenceNumber = maxOps;
				assert.strictEqual(runner.idleTime, maxIdleTime, "should start at the maxIdleTime");

				data.numRuntimeOps += 50;
				assert.strictEqual(runner.idleTime, maxIdleTime - 5);

				data.numRuntimeOps += 123;
				assert.strictEqual(runner.idleTime, maxIdleTime - 17.3);

				data.numNonRuntimeOps += 500;
				assert.strictEqual(runner.idleTime, maxIdleTime - 567.3);

				data.numNonRuntimeOps += 1;
				assert.strictEqual(runner.idleTime, maxIdleTime - 568.4);
			});

			it("Weights ops properly", () => {
				const maxOps = 2;
				const runtimeOpWeight = 0.1;
				const nonRuntimeOpWeight = 1.1;
				initialize({ maxOps, runtimeOpWeight, nonRuntimeOpWeight });

				data.lastOpSequenceNumber = maxOps;

				data.numRuntimeOps += 9;
				runner.run();
				assertAttemptCount(0, "should not run yet");

				data.numNonRuntimeOps += 1;
				runner.run();
				assertAttemptCount(0, "should not run yet");

				data.numRuntimeOps += 1;
				runner.run();
				assertAttemptCount(1, "should run");
				assert(getLastAttempt() === "maxOps");
			});
		});
	});
});
