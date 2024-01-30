/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider, createSummarizer, summarizeNow } from "@fluidframework/test-utils";

describeCompat(
	"Summarizer can refresh a snapshot from the server",
	"2.0.0-rc.1.0.0",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const createContainer = async (): Promise<IContainer> => {
			return provider.makeTestContainer();
		};

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("The summarizing client can refresh from an unexpected ack", async () => {
			const container = await createContainer();
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
	},
);
