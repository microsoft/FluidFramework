/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import {
	DefaultSummaryConfiguration,
	ISummaryAckMessage,
	ISummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createTestConfigProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describeCompat(
	"Summarizer can refresh a snapshot from the server",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("The summarizing client will immediately refresh its own summaries", async () => {
			if (provider.driver.type !== "local") {
				// skip other drivers as the test would look quite different just to replicate the same behavior
				return;
			}
			const summaryConfig: ISummaryConfiguration = {
				...DefaultSummaryConfiguration,
				...{
					maxTime: 5000 * 12,
					maxAckWaitTime: 120000,
					maxOps: 1,
					initialSummarizerDelayMs: 0,
				},
			};
			const mockLogger = new MockLogger();
			const configProvider = createTestConfigProvider();
			configProvider.set("Fluid.Summarizer.immediatelyRefreshLatestSummaryAck", true);
			const testContainerConfig: ITestContainerConfig = {
				runtimeOptions: {
					summaryOptions: {
						summaryConfigOverrides: summaryConfig,
					},
				},
				loaderProps: {
					logger: mockLogger,
					configProvider,
				},
			};
			const container = await provider.makeTestContainer(testContainerConfig);
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject = (await container.getEntryPoint()) as ITestDataObject;
			const dataObject2 = (await container2.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(container);
			await waitForContainerConnection(container2);

			// The first summary needs to be generated otherwise the summarizer will only generate one summary.
			// Submitting an op will cause the first summary to be generated.
			// Specifically consecutive summaries occur because the retry logic based on the call to trySummarize
			// requires the summarizerLock to be defined. By generating the first summary, the summary lock becomes
			// defined and the heuristics runner runs in the afterSummaryAction.
			dataObject._root.set(`first`, "op");
			await provider.ensureSynchronized();
			mockLogger.assertMatch(
				[
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
				],
				"expected first summary to be generated",
			);
			mockLogger.clear();

			// All this does is make a promise that the container will see two summaries.
			const twoSummariesDeferred = new Deferred<void>();
			const summaryVersions: string[] = [];
			let summariesSeen = 0;
			container.on("op", (op) => {
				if (op.type === MessageType.SummaryAck) {
					summaryVersions.push((op as ISummaryAckMessage).contents.handle);
					summariesSeen++;
					if (summariesSeen >= 2) {
						twoSummariesDeferred.resolve();
					}
				}
				if (op.type === MessageType.SummaryNack) {
					throw new Error("Unexpected summary nack");
				}
			});

			// Sending ops from two different clients/containers causes the heuristics summarizer to handle ops twice, which causes the summarizer to summarize before acking its first summary.
			// Sending ops from the same client does not cause the heuristics summarizer to handle ops twice probably because of batching.
			dataObject._root.set(`a`, "op1");
			dataObject2._root.set(`b`, "op2");
			await provider.ensureSynchronized();
			// Wait for two summaries to be seen by the container.
			await twoSummariesDeferred.promise;

			mockLogger.assertMatch(
				[
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
					{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
					{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
				],
				"two summaries should be generated in succession from two ops.",
			);
			assert.strictEqual(summaryVersions.length, 2, "expected 2 consecutive summaries");
		});
	},
);
