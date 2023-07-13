/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITestDataObject, describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { Deferred } from "@fluidframework/common-utils";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
	SubmitSummaryFailureData,
	SubmitSummaryResult,
	SummarizeResultPart,
} from "@fluidframework/container-runtime";

describeNoCompat("Summaries can be found on the main client", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const summaryConfigOverrides = {
		...DefaultSummaryConfiguration,
		maxOps: 1,
		initialSummarizerDelayMs: 1,
	};
	const testConfig: ITestContainerConfig = {
		runtimeOptions: { summaryOptions: { summaryConfigOverrides } },
	};
	const createContainer = async (): Promise<IContainer> => {
		return provider.makeTestContainer(testConfig);
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Can find summaries from the main client", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<ITestDataObject>(container, "default");
		const runtime = dataObject._context.containerRuntime as ContainerRuntime;
		const summarize = new Deferred<
			SummarizeResultPart<SubmitSummaryResult, SubmitSummaryFailureData>
		>();
		runtime.on(
			"experimentalSummary",
			(
				summarizeResults: SummarizeResultPart<
					SubmitSummaryResult,
					SubmitSummaryFailureData
				>,
			) => {
				summarize.resolve(summarizeResults);
			},
		);
		dataObject._root.set("op", "1");
		const result = await summarize.promise;
		assert(result !== undefined, "Result should be defined!");
		assert(result.success, "Summary should be successful!");
		assert(result.data !== undefined, "Summary data should be defined!");
		assert(result.data.stage === "submit", "Summary should have been submitted");
	});
});
