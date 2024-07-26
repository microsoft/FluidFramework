/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
};

describeCompat("Signal performance telemetry", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	itExpects(
		"Signal performance telemetry",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:SignalLatency",
				clientType: "interactive",
			},
		],
		async () => {
			// Create container with read-connection
			const container = await provider.makeTestContainer();
			const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			for (let i = 0; i < 130; i++) {
				dataObject.context.containerRuntime.submitSignal("signal", "test");
			}

			await provider.ensureSynchronized();
		},
	);
});
