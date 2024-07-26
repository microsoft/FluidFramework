/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
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
	let dataObject: ITestFluidObject;
	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
		const container = await provider.makeTestContainer();
		dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		// need to be connected to send signals
		if (container.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container.once("connected", resolve));
		}
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

			for (let i = 0; i < 130; i++) {
				dataObject.context.containerRuntime.submitSignal("signal", "test");
			}

			await provider.ensureSynchronized();
		},
	);
});
