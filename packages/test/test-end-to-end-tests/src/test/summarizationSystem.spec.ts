/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITestDataObject, describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ContainerRuntime, DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { Deferred } from "@fluidframework/common-utils";

describeNoCompat("Do not need summarize on demand", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: { summaryOptions: { summaryConfigOverrides: DefaultSummaryConfiguration } },
	};

	const createContainer = async (): Promise<IContainer> => {
		return provider.makeTestContainer(testContainerConfig);
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Can get summaries", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<ITestDataObject>(container, "default");
		const containerRuntime = dataObject._context.containerRuntime;
		const waitForSummary = new Deferred<void>();
		(containerRuntime as any).summarizerClientElection.on("electedSummarizerChanged", () => {
			const runtime = (containerRuntime as any).summaryManager.summarizer
				?.runtime as ContainerRuntime;
			if (runtime !== undefined) {
				runtime.on("experimentalSummary", (summaryResults) => {
					waitForSummary.resolve(summaryResults);
				});
			}
		});
		dataObject._root.set("an", "op Or 1");
		dataObject._root.set("an", "op Or 2");
		dataObject._root.set("an", "op Or 3");
		dataObject._root.set("an", "op Or 4");
		dataObject._root.set("an", "op Or 5");
		dataObject._root.set("an", "op Or 6");
		dataObject._root.set("an", "op Or 7");
		dataObject._root.set("an", "op Or 8");
		dataObject._root.set("an", "op Or 9");
		dataObject._root.set("an", "op Or 10");
		const result = await waitForSummary.promise;
		assert(result !== undefined, "Should be able to get a summary!");
	});
});
