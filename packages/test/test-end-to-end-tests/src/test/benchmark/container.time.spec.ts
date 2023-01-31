/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark } from "@fluid-tools/benchmark";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	LoaderHeader,
	IFluidCodeDetails,
	// IContainer,
} from "@fluidframework/container-definitions";
import { Container, Loader, ILoaderProps } from "@fluidframework/container-loader";
import {
	LocalCodeLoader,
	LoaderContainerTracker,
	ITestObjectProvider,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

const codeDetails: IFluidCodeDetails = { package: "test" };

describeNoCompat("Container - runtime benchmarks", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let loader: Loader;
	const loaderContainerTracker = new LoaderContainerTracker();
	const existingContainerId = "existingContainerId";

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

	before(function () {
		provider = getTestObjectProvider();

		// TODO: Convert these to mocked unit test. These are all API tests and doesn't
		// need the service.  For new disable the tests other than local driver
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});
	before(async () => {
		loader = createLoader();
		loaderContainerTracker.add(loader);
		const container = await loader.createDetachedContainer(codeDetails);
		await container.attach(provider.driver.createCreateNewRequest(existingContainerId));
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
			const testRequest: IRequest = { url: `fluid-test://localhost/${existingContainerId}` };
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
