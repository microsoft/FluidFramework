/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import { ILoaderProps, Loader } from "@fluidframework/container-loader/internal";
import {
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import { isILoggingError, normalizeError } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";
import { v4 as uuid } from "uuid";

import { wrapObjectAndOverride } from "../mocking.js";

// REVIEW: enable compat testing?
describeCompat("Errors Types", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let fileName: string;
	let containerUrl: IResolvedUrl;
	const loaderContainerTracker = new LoaderContainerTracker();
	before(() => {
		provider = getTestObjectProvider();
	});

	beforeEach("setup", async () => {
		const loader = new Loader({
			logger: provider.logger,
			urlResolver: provider.urlResolver,
			documentServiceFactory: provider.documentServiceFactory,
			codeLoader: new LocalCodeLoader([
				[provider.defaultCodeDetails, new TestFluidObjectFactory([])],
			]),
		});
		fileName = uuid();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		loaderContainerTracker.addContainer(container);
		await container.attach(provider.driver.createCreateNewRequest(fileName));
		assert(container.resolvedUrl);
		containerUrl = container.resolvedUrl;
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	async function loadContainer(props?: Partial<ILoaderProps>) {
		const loader = new Loader({
			...props,
			logger: provider.logger,
			urlResolver: props?.urlResolver ?? provider.urlResolver,
			documentServiceFactory: props?.documentServiceFactory ?? provider.documentServiceFactory,
			codeLoader:
				props?.codeLoader ??
				new LocalCodeLoader([[provider.defaultCodeDetails, new TestFluidObjectFactory([])]]),
		});
		const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
		const container = await loader.resolve({ url: requestUrl });
		loaderContainerTracker.addContainer(container);
		return container;
	}

	itExpects(
		"GeneralError Test",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				errorType: ContainerErrorTypes.genericError,
				error: "Injected error",
				fatalConnectError: true,
			},
		],
		async () => {
			try {
				const mockFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
					provider.documentServiceFactory,
					{
						createDocumentService: {
							connectToDeltaStream: () => () => {
								throw new Error("Injected error");
							},
						},
					},
				);

				await loadContainer({ documentServiceFactory: mockFactory });
			} catch (e: any) {
				assert(e.errorType === ContainerErrorTypes.genericError);
				assert(e.message === "Injected error");
				assert(e.fatalConnectError);
			}
		},
	);

	it("Clear odsp driver cache on critical load error", async function () {
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
		const documentServiceFactory = provider.documentServiceFactory;
		// eslint-disable-next-line @typescript-eslint/dot-notation
		const cache = documentServiceFactory["persistedCache"];
		const cacheFileEntry = {
			type: "snapshot",
			key: "",
			file: {
				resolvedUrl: containerUrl,
				docId: containerUrl.id,
			},
		};
		assert(
			(await cache?.get?.(cacheFileEntry)) !== undefined,
			"create container should have cached the snapshot",
		);
		try {
			const mockFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
				provider.documentServiceFactory,
				{
					createDocumentService: {
						connectToStorage: () => () => {
							throw new Error("Injected error");
						},
					},
				},
			);
			await loadContainer({ documentServiceFactory: mockFactory });
		} catch (e: any) {
			assert(e.errorType === ContainerErrorTypes.genericError);
			assert(e.message === "Injected error");
		}
		assert(
			(await cache?.get?.(cacheFileEntry)) === undefined,
			"odsp cache should have been cleared on critical error/container dispose",
		);
	});

	function assertCustomPropertySupport(err: any) {
		err.asdf = "asdf";
		assert(isILoggingError(err), "Error should support getTelemetryProperties()");
		assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
	}

	it("Check double conversion of network error", async () => {
		const networkError = createOdspNetworkError("Test Error", 400);
		const error1 = normalizeError(networkError);
		const error2 = normalizeError(error1);
		assertCustomPropertySupport(error1);
		assertCustomPropertySupport(error2);
		assert.deepEqual(networkError, error1, "networkError, error1 should be the same!");
		assert.deepEqual(error1, error2, "error1, error2 should be the same!");
	});
});
