/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeFullVersionCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describeFullVersionCompat(
	"Tests with different versions used for creating vs loading a container",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let container1: IContainer;
		let container2: IContainer;
		let dataObject1: ITestFluidObject;
		let dataObject2: ITestFluidObject;

		beforeEach(async () => {
			provider = getTestObjectProvider();
			container1 = await provider.makeTestContainer(testContainerConfig);
			dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

			container2 = await provider.loadTestContainer(testContainerConfig);
			dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

			await provider.ensureSynchronized();
		});

		const IdleDetectionTime = 100;
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						...DefaultSummaryConfiguration,
						...{
							minIdleTime: IdleDetectionTime,
							maxIdleTime: IdleDetectionTime,
							maxTime: IdleDetectionTime * 12,
							initialSummarizerDelayMs: 10,
						},
					},
				},
				gcOptions: {
					gcAllowed: true,
				},
			},
		};

		it("Can create/load with the correct versions", async () => {
			console.log(
				(dataObject1.context.containerRuntime as any).createContainerMetadata
					.createContainerRuntimeVersion,
			);
			console.log(
				(dataObject2.context.containerRuntime as any).createContainerMetadata
					.createContainerRuntimeVersion,
			);
		});
	},
);
