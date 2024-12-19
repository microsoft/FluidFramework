/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import {
	IFluidCodeDetails,
	DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import { ILoaderProps, Loader } from "@fluidframework/container-loader/internal";
import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";
import { v4 as uuid } from "uuid";

const codeDetails: IFluidCodeDetails = { package: "test" };

describeCompat("Container - runtime benchmarks", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let loader: Loader;
	let fileName: string;
	let containerUrl: IResolvedUrl;

	const loaderContainerTracker = new LoaderContainerTracker();

	function createLoader(props?: Partial<ILoaderProps>): Loader {
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

	before(async () => {
		provider = getTestObjectProvider();
		loader = createLoader();
		loaderContainerTracker.add(loader);
		const container = await loader.createDetachedContainer(codeDetails);

		fileName = uuid();
		await container.attach(provider.driver.createCreateNewRequest(fileName));
		assert(container.resolvedUrl);
		containerUrl = container.resolvedUrl;
	});
	afterEach(() => {
		loaderContainerTracker.reset();
	});

	benchmark({
		title: "Create loader",
		benchmarkFn: () => {
			createLoader();
		},
	});

	benchmark({
		title: "Create detached container",
		benchmarkFnAsync: async () => {
			await loader.createDetachedContainer(codeDetails);
		},
	});

	benchmark({
		title: "Create detached container and attach it",
		after: async () => {
			loaderContainerTracker.reset();
		},
		benchmarkFnAsync: async () => {
			const container = await loader.createDetachedContainer(codeDetails);
			await container.attach(provider.driver.createCreateNewRequest("newAttachedContainerId"));
			container.close(DisconnectReason.Expected);
		},
	});

	benchmark({
		title: "Load existing container",
		benchmarkFnAsync: async () => {
			const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
			const testRequest: IRequest = { url: requestUrl };
			await loader.resolve(testRequest);
		},
	});
});
