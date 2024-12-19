/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluid-private/test-version-utils";
import { IContainer, DisconnectReason } from "@fluidframework/container-definitions/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import {
	IBenchmarkParameters,
	IDocumentLoader,
	benchmarkAll,
	createDocument,
} from "./DocumentCreator.js";

describeE2EDocRun("Load Document", (getTestObjectProvider, getDocumentInfo) => {
	let documentWrapper: IDocumentLoader;
	let provider: ITestObjectProvider;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		if (
			docData.supportedEndpoints &&
			!docData.supportedEndpoints?.includes(provider.driver.type)
		) {
			return;
		}
		documentWrapper = createDocument({
			testName: `Load Document - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			documentTypeInfo: docData.documentTypeInfo,
			benchmarkType,
		});
		await documentWrapper.initializeDocument();
	});

	beforeEach("conditionalSkip", async function () {
		const docData = getDocumentInfo();
		if (
			docData.supportedEndpoints &&
			!docData.supportedEndpoints?.includes(provider.driver.type)
		) {
			this.skip();
		}
	});
	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	benchmarkAll(
		"Load Document",
		new (class PerformanceTestWrapper implements IBenchmarkParameters {
			container: IContainer | undefined;
			minSampleCount = getDocumentInfo().minSampleCount;
			async run(): Promise<void> {
				this.container = await documentWrapper.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				this.container.close(DisconnectReason.Expected);
			}
			async before(): Promise<void> {
				this.container = undefined;
				await delay(1000);
			}
		})(),
	);
});
