/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	LoaderHeader,
	IFluidCodeDetails,
	ILoader,
	IContainer,
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

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = { package: "test" };

describeNoCompat("Container - memory usage benchmarks", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let loader: Loader;
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

	before(function () {
		provider = getTestObjectProvider();

		// TODO: Convert these to mocked unit test. These are all API tests and doesn't
		// need the service.  For now disable the tests other than local driver
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});
	before(async () => {
		loader = createLoader();
		loaderContainerTracker.add(loader);
		const container = await loader.createDetachedContainer(codeDetails);
		await container.attach(provider.driver.createCreateNewRequest("containerTest"));
	});
	afterEach(() => {
		loaderContainerTracker.reset();
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Create loader";
			private loader: ILoader | undefined;

			beforeIteration() {
				this.loader = undefined;
			}

			async run() {
				this.loader = createLoader();
			}
		})(),
	);

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Create detached container";
			private container: IContainer | undefined;

			beforeIteration() {
				this.container = undefined;
			}

			async run() {
				this.container = await loader.createDetachedContainer(codeDetails);
			}
		})(),
	);

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Create detached container and attach it";
			private container: IContainer | undefined;

			beforeIteration() {
				this.container = undefined;
			}

			async run() {
				this.container = await loader.createDetachedContainer(codeDetails);
				await this.container.attach(
					provider.driver.createCreateNewRequest("containerTest"),
				);
			}
		})(),
	);

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Load existing container";
			async run() {
				const testResolved = await loader.services.urlResolver.resolve(testRequest);
				ensureFluidResolvedUrl(testResolved);
				const container = await Container.load(loader, {
					canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
					clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
					resolvedUrl: testResolved,
					version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
					loadMode: testRequest.headers?.[LoaderHeader.loadMode],
				});
				assert.strictEqual(
					container.clientDetails.capabilities.interactive,
					true,
					"Client details should be set with interactive as true",
				);
			}
		})(),
	);
});
