/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { IRequest } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails, ILoader, IContainer } from "@fluidframework/container-definitions";
import { Loader, ILoaderProps } from "@fluidframework/container-loader";
import {
	LocalCodeLoader,
	LoaderContainerTracker,
	ITestObjectProvider,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

const codeDetails: IFluidCodeDetails = { package: "test" };

describeCompat("Container - memory usage benchmarks", "NoCompat", (getTestObjectProvider) => {
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
				const requestUrl = await provider.driver.createContainerUrl(fileName, containerUrl);
				const testRequest: IRequest = { url: requestUrl };
				const container = await loader.resolve(testRequest);
			}
		})(),
	);
});
