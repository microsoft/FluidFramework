/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	loadSummarizerContainerAndMakeSummary,
	ILoadExistingContainerProps,
} from "@fluidframework/container-loader/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createLoaderProps,
	ITestContainerConfig,
	ITestFluidObject,
	DataObjectFactoryType,
} from "@fluidframework/test-utils/internal";

describeCompat("on-demand summarizer api", "NoCompat", (getTestObjectProvider, apis) => {
	let logger: MockLogger;

	beforeEach(() => {
		logger = new MockLogger();
	});

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
	};

	async function buildLoadProps(): Promise<ILoadExistingContainerProps> {
		const provider = getTestObjectProvider();
		const container = await provider.makeTestContainer(testContainerConfig);
		const entry = (await container.getEntryPoint()) as ITestFluidObject;
		assert(entry !== undefined, "entry point must resolve");
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		const loaderProps = createLoaderProps(
			[[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
			provider.documentServiceFactory,
			provider.urlResolver,
		);
		return { ...loaderProps, request: { url }, logger };
	}

	it("summarizes successfully (gate off)", async () => {
		const props = await buildLoadProps();
		const result = await loadSummarizerContainerAndMakeSummary(props);
		assert(result.success, "expected summarization success");
		const created = logger.events.filter((e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_created");
		const closed = logger.events.filter((e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed");
		assert.strictEqual(created.length, 1, "created telemetry missing");
		assert.strictEqual(closed.length, 1, "closed telemetry missing");
		assert.strictEqual(closed[0].success, true, "closed event should indicate success");
	});

	it("summarizes successfully with fullTree gate on", async () => {
		const props = await buildLoadProps();
		const configProvider = {
			getRawConfig: (key: string) =>
				key === "Fluid.Summarizer.FullTree.OnDemand" ? true : undefined,
		};
		const result = await loadSummarizerContainerAndMakeSummary({
			...props,
			logger,
			configProvider,
		});
		assert(result.success, "expected summarization success with gate");
		const closed = logger.events.filter((e) => e.eventName === "fluid:telemetry:SummarizerOnDemand:summarizerContainer_closed");
		assert.strictEqual(closed.length, 1, "closed telemetry missing (gate)");
		assert.strictEqual(closed[0].success, true, "closed event should indicate success (gate)");
	});
});
