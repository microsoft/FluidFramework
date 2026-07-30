/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	createSummarizer,
	getContainerEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

/**
 * Minimal end-to-end smoke test for the summarization pattern: create an interactive container,
 * take a summary with a dedicated summarizer, load a fresh container from that summary, and
 * validate the change round-tripped.
 *
 * @remarks This test is embedded into `WritingTestsThatTakeSummaries.md` via markdown-magic; run
 * `npm run build:readme` from the repo root after changing it to keep the docs in sync.
 */
describeCompat("Summarization smoke test", "NoCompat", (getTestObjectProvider) => {
	// Interactive containers disable the runtime's automatic summarizer so the test controls
	// exactly when summaries happen (via summarizeNow on a dedicated summarizer).
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("round-trips a change through a summary", async () => {
		// 1. Create an interactive container with auto-summaries disabled.
		const container = await provider.makeTestContainer(testContainerConfig);
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		await waitForContainerConnection(container);

		// 2. Create a dedicated summarizer. Pass no config so createSummarizer applies its default
		// summary config (state: "disableHeuristics") rather than inheriting state: "disabled".
		const { summarizer } = await createSummarizer(provider, container);

		// 3. Make a change, synchronize, summarize.
		dataObject.root.set("key", "value");
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		// 4. Load a fresh container from that exact summary and validate.
		const loaded = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const loadedObject = await getContainerEntryPointBackCompat<ITestFluidObject>(loaded);
		assert.strictEqual(loadedObject.root.get("key"), "value");

		// 5. Hand off to a new summarizer loaded from that summary.
		summarizer.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			container,
			undefined /* config */,
			summaryVersion,
		);
		await assert.doesNotReject(summarizeNow(summarizer2));
	});
});
