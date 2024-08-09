/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	type ITestObjectProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils/internal";

describeCompat("Odsp Network calls", "NoCompat", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		flushMode: FlushMode.Immediate,
	};
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions,
	};

	let provider: ITestObjectProvider;

	beforeEach("setup", async function () {
		provider = getTestObjectProvider();
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
	});

	it("Should not make odsp network calls", async () => {
		const container = await provider.makeTestContainer(testContainerConfig);
		const mainObject = (await container.getEntryPoint()) as ITestDataObject;
		for (let i = 0; i < 250; i++) {
			mainObject._root.set(`${i}`, i);
		}

		await provider.ensureSynchronized();

		// push flush ops to storage
		await (container.deltaManager as any).connectionManager.connection.flush();

		const mockLogger = new MockLogger();
		// new container
		const container2 = await provider.loadTestContainer({
			runtimeOptions,
			loaderProps: { logger: mockLogger },
		});

		const mainObject2 = (await container2.getEntryPoint()) as ITestDataObject;

		assert(mainObject2._root.size === 250);
		assert(container2.deltaManager.lastSequenceNumber > 200);

		mockLogger.assertMatch([
			{ eventName: "fluid:telemetry:OdspDriver:OpsFetch_end", length: 200 },
			{ eventName: "fluid:telemetry:OdspDriver:OpsFetch_end" },
		]);
	});
});
