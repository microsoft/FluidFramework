/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { benchmark } from "@fluid-tools/benchmark";
import { IRequest } from "@fluidframework/core-interfaces";
import { LoaderHeader, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader, ILoaderProps } from "@fluidframework/container-loader";
import {
	LocalCodeLoader,
	LoaderContainerTracker,
	ITestObjectProvider,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

const codeDetails: IFluidCodeDetails = { package: "test" };

describeNoCompat("Container - runtime benchmarks", (getTestObjectProvider) => {
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
			documentServiceFactory:
				props?.documentServiceFactory ?? provider.documentServiceFactory,
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
			await container.attach(
				provider.driver.createCreateNewRequest("newAttachedContainerId"),
			);
			container.close();
		},
	});

	benchmark({
		title: "Load existing container",
		benchmarkFnAsync: async () => {
			const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
			const testRequest: IRequest = { url: requestUrl };
			const testResolved = await loader.services.urlResolver.resolve(testRequest);
			ensureFluidResolvedUrl(testResolved);
			await Container.load(loader, {
				canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
				clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
				resolvedUrl: testResolved,
				version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
				loadMode: testRequest.headers?.[LoaderHeader.loadMode],
			});
		},
	});
});
