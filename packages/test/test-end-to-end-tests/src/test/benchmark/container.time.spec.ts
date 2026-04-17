/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { TestType, benchmarkIt, collectDurationData } from "@fluid-tools/benchmark";
import { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ILoaderProps, Loader } from "@fluidframework/container-loader/internal";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";
import { v4 as uuid } from "uuid";

const codeDetails: IFluidCodeDetails = { package: "test" };

describeCompat("Container - runtime benchmarks", "NoCompat", (getTestObjectProvider) => {
	const loaderContainerTracker = new LoaderContainerTracker();

	function createLoader(provider: ITestObjectProvider, props?: Partial<ILoaderProps>): Loader {
		return new Loader({
			...props,
			logger: provider.logger,
			urlResolver: props?.urlResolver ?? provider.urlResolver,
			documentServiceFactory: props?.documentServiceFactory ?? provider.documentServiceFactory,
			codeLoader:
				props?.codeLoader ??
				new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
		});
	}

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	benchmarkIt({
		testType: TestType.ExecutionTime,
		title: "Create loader",
		run: async () => {
			const provider = getTestObjectProvider();
			return collectDurationData({
				benchmarkFn: () => {
					createLoader(provider);
				},
			});
		},
	});

	benchmarkIt({
		testType: TestType.ExecutionTime,
		title: "Create detached container",
		run: async () => {
			const provider = getTestObjectProvider();
			const loader = createLoader(provider);
			loaderContainerTracker.add(loader);
			return collectDurationData({
				benchmarkFnAsync: async () => {
					await loader.createDetachedContainer(codeDetails);
				},
			});
		},
	});

	benchmarkIt({
		testType: TestType.ExecutionTime,
		title: "Create detached container and attach it",
		run: async () => {
			const provider = getTestObjectProvider();
			const loader = createLoader(provider);
			loaderContainerTracker.add(loader);
			const result = await collectDurationData({
				benchmarkFnAsync: async () => {
					const container = await loader.createDetachedContainer(codeDetails);
					await container.attach(
						provider.driver.createCreateNewRequest("newAttachedContainerId"),
					);
					container.close();
				},
			});
			loaderContainerTracker.reset();
			return result;
		},
	});

	benchmarkIt({
		testType: TestType.ExecutionTime,
		title: "Load existing container",
		run: async () => {
			const provider = getTestObjectProvider();
			const loader = createLoader(provider);
			loaderContainerTracker.add(loader);

			// Create the container to load in the benchmark
			const container = await loader.createDetachedContainer(codeDetails);
			const fileName = uuid();
			await container.attach(provider.driver.createCreateNewRequest(fileName));
			assert(container.resolvedUrl);
			const containerUrl = container.resolvedUrl;

			return collectDurationData({
				benchmarkFnAsync: async () => {
					const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
					const testRequest: IRequest = { url: requestUrl };
					await loader.resolve(testRequest);
				},
			});
		},
	});
});
