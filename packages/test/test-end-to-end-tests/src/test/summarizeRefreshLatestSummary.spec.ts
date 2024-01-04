/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	mockConfigProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	DefaultSummaryConfiguration,
	ISummaryAckMessage,
	ISummaryConfiguration,
} from "@fluidframework/container-runtime";
import { MessageType } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { Deferred } from "@fluidframework/core-utils";

describeCompat(
	"Summarizer can refresh a snapshot from the server",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("The summarizing client can refresh from an unexpected ack", async () => {
			const container = await provider.makeTestContainer();
			const { container: summarizingContainer, summarizer } = await createSummarizer(
				provider,
				container,
			);

			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer);
			assert(!summarizingContainer.closed, "Refreshing acks should not close the summarizer");
			assert(!container.closed, "Original container should not be closed");

			await summarizeNow(summarizer);
			summarizer.stop("summarizerClientDisconnected");
			summarizer.close();
			await createSummarizer(provider, container, undefined, summaryVersion);
			await provider.ensureSynchronized();
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
			const testContainerConfig: ITestContainerConfig = {
				runtimeOptions: {
					summaryOptions: {
						summaryConfigOverrides: summaryConfig,
					},
				},
				loaderProps: {
					logger: mockLogger,
					configProvider: mockConfigProvider({
						"Fluid.Summarizer.immediatelyRefreshLatestSummaryAck": true,
					}),
				},
			};
			const container = await provider.makeTestContainer(testContainerConfig);
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject = (await container.getEntryPoint()) as ITestDataObject;
			const dataObject2 = (await container2.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(container);
			await waitForContainerConnection(container2);

			// The first summary needs to be generated otherwise the summarizer will only generate one summary.
			dataObject._root.set(`first`, "op");
			await provider.ensureSynchronized();
			mockLogger.assertMatch([
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
			]);

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
			await twoSummariesDeferred.promise;

			// This verifies that two summaries were generated in succession from two ops.
			mockLogger.assertMatch([
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_start" },
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_end" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_start" },
				{ eventName: "fluid:telemetry:SummarizerNode:refreshLatestSummary_end" },
			]);
			assert.strictEqual(summaryVersions.length, 2, "expected 2 consecutive summaries");
		});
	},
);
