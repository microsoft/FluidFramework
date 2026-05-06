/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeE2EDocs } from "@fluid-private/test-version-utils";
import { BenchmarkMode, currentBenchmarkMode } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { delay } from "@fluidframework/core-utils/internal";

import {
	IBenchmarkParameters,
	IDocumentLoader,
	benchmarkAll,
	createDocument,
} from "./DocumentCreator.js";

describeE2EDocs("Load Document", (getTestObjectProvider, getDocumentInfo) => {
	let documentWrapper: IDocumentLoader;
	beforeEach(async function () {
		const provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		if (
			docData.supportedEndpoints &&
			!docData.supportedEndpoints?.includes(provider.driver.type)
		) {
			this.skip();
		}
		documentWrapper = createDocument({
			testName: `Load Document - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			documentTypeInfo: docData.documentTypeInfo,
		});
		await documentWrapper.initializeDocument();
	});
	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	benchmarkAll("Load Document", () => {
		return new (class PerformanceTestWrapper implements IBenchmarkParameters {
			container: IContainer | undefined;
			minSampleCount = getDocumentInfo().minSampleCount;
			async run(): Promise<void> {
				this.container = await documentWrapper.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				this.container.close();
			}
			async before(): Promise<void> {
				this.container = undefined;
				if (currentBenchmarkMode === BenchmarkMode.Performance) {
					// TODO: this should be removed, or document why it exists
					await delay(1000);
				}
			}
		})();
	});
});
