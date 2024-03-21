/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { ILoaderProps } from "@fluidframework/container-loader";
import { type SharedString } from "@fluidframework/sequence";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createTestConfigProvider,
} from "@fluidframework/test-utils";

/**
 * Regression tests for issue where clients loading a container with a write connection (vs the read connection
 * that became the default) would never generate OpRoundtripTime telemetry.
 */
describeCompat(
	"All clients generate OpRoundtripTime telemetry",
	// TODO: this should be "2.0.0-rc.2.0.0" (I think) once the bugs with describeCompat are fixed and versions are used correctly
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedString } = apis.dds;

		const customConfigProvider = createTestConfigProvider();
		customConfigProvider.set("Fluid.Container.ForceWriteConnection", true);
		const loaderPropsThatForceWriteConnection: Partial<ILoaderProps> = {
			configProvider: customConfigProvider,
		};

		const stringId = "stringKey";
		const configWithReadConnection: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: [[stringId, SharedString.getFactory()]],
		};
		const configWithWriteConnection = {
			...configWithReadConnection,
			loaderProps: loaderPropsThatForceWriteConnection,
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		itExpects(
			"Create with read connection and load with read connection",
			[
				// Expect one OpRoundtripTime event from each client
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
			],
			async () => {
				// Create container with read-connection
				const container1 = await provider.makeTestContainer(configWithReadConnection);
				const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
				const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
				sharedString1.insertText(0, "a");

				// Load the container with read-connection
				const container2 = await provider.loadTestContainer(configWithReadConnection);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
				sharedString2.insertText(0, "b");

				await provider.ensureSynchronized();
			},
		);

		itExpects(
			"Create with read connection and load with write connection",
			[
				// Expect one OpRoundtripTime event from each client
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
			],
			async () => {
				// Create container with read-connection
				const container1 = await provider.makeTestContainer(configWithReadConnection);
				const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
				const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
				sharedString1.insertText(0, "a");

				// Load the container with write-connection
				const container2 = await provider.loadTestContainer(configWithWriteConnection);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
				sharedString2.insertText(0, "b");

				await provider.ensureSynchronized();
			},
		);

		itExpects(
			"Create with write connection and load with read connection",
			[
				// Expect one OpRoundtripTime event from each client
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
			],
			async () => {
				// Create container with write-connection
				const container1 = await provider.makeTestContainer(configWithWriteConnection);
				const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
				const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
				sharedString1.insertText(0, "a");

				// Load the container with read-connection
				const container2 = await provider.loadTestContainer(configWithReadConnection);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
				sharedString2.insertText(0, "b");

				await provider.ensureSynchronized();
			},
		);

		itExpects(
			"Create with write connection and load with write connection",
			[
				// Expect one OpRoundtripTime event from each client
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
				{ eventName: "fluid:telemetry:OpRoundtripTime", clientType: "interactive" },
			],
			async () => {
				// Create container with write-connection
				const container1 = await provider.makeTestContainer(configWithWriteConnection);
				const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
				const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
				sharedString1.insertText(0, "a");

				// Load the container with write-connection
				const container2 = await provider.loadTestContainer(configWithWriteConnection);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
				sharedString2.insertText(0, "b");

				await provider.ensureSynchronized();
			},
		);
	},
);
