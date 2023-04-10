/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	mockConfigProvider,
} from "@fluidframework/test-utils";

describeNoCompat("Config options are logged", (getTestObjectProvider) => {
	const settings = {
		string: "restart",
		stringArray: ["1", "2"],
		number: 1,
		numberArray: [1, 2],
		boolean: false,
		booleanArray: [true, false],
	};

	const configProvider = mockConfigProvider(settings);
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
		loaderProps: { configProvider },
	};

	let provider: ITestObjectProvider;
	const createContainer = async (): Promise<IContainer> => {
		return provider.makeTestContainer(testContainerConfig);
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	itExpects(
		"The ContainerRuntime can log config entries",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:ConfigEntries",
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				configEntries: JSON.stringify(configProvider.getRawConfigEntries!()),
			},
		],
		async () => {
			await createContainer();
		},
	);
});
