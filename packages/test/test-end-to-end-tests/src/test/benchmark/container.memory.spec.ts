/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IMemoryTestObject, benchmarkMemory } from "@fluid-tools/benchmark";
import {
	IContainer,
	IFluidCodeDetails,
	ILoader,
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
				await this.container.attach(provider.driver.createCreateNewRequest("containerTest"));
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
