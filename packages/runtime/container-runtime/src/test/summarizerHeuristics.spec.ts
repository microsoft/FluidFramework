/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { MockLogger } from "@fluidframework/telemetry-utils";
import {
    ISummaryConfiguration,
    ISummaryConfigurationHeuristics,
} from "../containerRuntime";
import { SummarizeHeuristicData, SummarizeHeuristicRunner } from "../summarizerHeuristics";
import { ISummarizeHeuristicData, ISummarizeAttempt } from "../summarizerTypes";
import { SummarizeReason } from "../summaryGenerator";

describe("Runtime", () => {
    describe("Summarization", () => {
        describe("Summarize Heuristic Runner", () => {
            let clock: sinon.SinonFakeTimers;
            before(() => { clock = sinon.useFakeTimers(); });
            after(() => { clock.restore(); });

            const defaultSummaryConfig: ISummaryConfigurationHeuristics = {
                state: "enabled",
                idleTime: 5000, // 5 sec (idle)
                maxTime: 5000 * 12, // 1 min (active)
                maxOps: 1000, // 1k ops (active)
                minOpsForLastSummaryAttempt: 50,
                maxAckWaitTime: 120000, // 2 min
                maxOpsSinceLastSummary: 7000,
                initialSummarizerDelayMs: 0,
                summarizerClientElection: false,
            };
            let summaryConfig: Readonly<ISummaryConfiguration>;
            let data: ISummarizeHeuristicData;
            let runner: SummarizeHeuristicRunner;
            let mockLogger: MockLogger;

            let attempts: SummarizeReason[];
            const trySummarize = (reason: SummarizeReason) => {
                attempts.push(reason);
            };
            const getLastAttempt = () => attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
            function assertAttemptCount(count: number, message?: string) {
                const fullMessage = `${attempts.length} !== ${count}; ${message || "unexpected attempt count"}`;
                assert(attempts.length === count, fullMessage);
            }

            function initialize({
                refSequenceNumber = 0,
                lastOpSequenceNumber = refSequenceNumber,
                summaryTime = Date.now(),
                idleTime = defaultSummaryConfig.idleTime,
                maxTime = defaultSummaryConfig.maxTime,
                maxOps = defaultSummaryConfig.maxOps,
                maxAckWaitTime = defaultSummaryConfig.maxAckWaitTime,
                maxOpsSinceLastSummary = defaultSummaryConfig.maxOpsSinceLastSummary,
                initialSummarizerDelayMs = defaultSummaryConfig.initialSummarizerDelayMs,
                summarizerClientElection = defaultSummaryConfig.summarizerClientElection,
                minOpsForLastSummaryAttempt = defaultSummaryConfig.minOpsForLastSummaryAttempt,
                run = true,
            }: Partial<ISummaryConfigurationHeuristics & ISummarizeAttempt & {
                lastOpSequenceNumber: number;
                run: boolean;
            }> = {}) {
                mockLogger = new MockLogger();
                data = new SummarizeHeuristicData(lastOpSequenceNumber, { refSequenceNumber, summaryTime });
                summaryConfig = {
                    state: "enabled",
                    idleTime,
                    maxTime,
                    maxOps,
                    maxAckWaitTime,
                    maxOpsSinceLastSummary,
                    initialSummarizerDelayMs,
                    summarizerClientElection,
                    minOpsForLastSummaryAttempt } as const;

                runner = new SummarizeHeuristicRunner(
                    data,
                    summaryConfig,
                    trySummarize,
                    mockLogger);

                if (run) {
                    runner.run();
                }
            }

            beforeEach(() => { attempts = []; });
            afterEach(() => { clock.reset(); });

            it("Should summarize after maxOps with no prior summary", () => {
                const maxOps = 100;
                initialize({ maxOps });

                data.lastOpSequenceNumber = maxOps;
                runner.run();
                assertAttemptCount(0, "should not run yet");

                data.lastOpSequenceNumber++;
                runner.run();
                assertAttemptCount(1, "should run now");
                assert(getLastAttempt() === "maxOps");
            });

            it("Should summarize after maxOps", () => {
                const lastSummary = 1000;
                const maxOps = 100;
                initialize({ refSequenceNumber: lastSummary, maxOps });

                data.lastOpSequenceNumber = lastSummary + maxOps;
                runner.run();
                assertAttemptCount(0, "should not run yet");

                data.lastOpSequenceNumber++;
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
                initialize({ refSequenceNumber: lastSummary, idleTime, maxTime });

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
                initialize({ refSequenceNumber: lastSummary, idleTime, maxTime });

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
                initialize({ refSequenceNumber: lastSummary, idleTime, maxTime });

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
                const lastSummary = 1000;
                const minOpsForLastSummaryAttempt = 10;
                initialize({ refSequenceNumber: lastSummary, minOpsForLastSummaryAttempt });

                data.lastOpSequenceNumber = lastSummary + minOpsForLastSummaryAttempt + 1;
                assert(runner.shouldRunLastSummary() === true, "should run on close");
            });

            it("Should not summarize on close if insufficient outstanding ops", () => {
                const lastSummary = 1000;
                const minOpsForLastSummaryAttempt = 10;
                initialize({ refSequenceNumber: lastSummary, minOpsForLastSummaryAttempt });

                data.lastOpSequenceNumber = lastSummary + minOpsForLastSummaryAttempt - 1;
                assert(runner.shouldRunLastSummary() === false,
                    "should not run on close");
            });

            it("Should not run idle timer after dispose", () => {
                const lastSummary = 1000;
                const idleTime = 101;
                const maxTime = 1000;
                initialize({ refSequenceNumber: lastSummary, idleTime, maxTime });

                clock.tick(idleTime - 1);
                runner.run();
                assertAttemptCount(0, "should not run yet");

                runner.dispose();
                clock.tick(1);
                runner.run();
                assertAttemptCount(0, "should still run since disposed");
            });
        });
    });
});
