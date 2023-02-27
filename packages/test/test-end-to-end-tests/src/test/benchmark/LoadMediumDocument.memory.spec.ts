/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";

const testName = "Load a 5Mb document";
describeNoCompat("Load Medium Document- memory benchmarks", (getTestObjectProvider) => {
	let documentCreator: DocumentCreator;
	let provider: ITestObjectProvider;

	before(async () => {
		provider = getTestObjectProvider();
		documentCreator = new DocumentCreator({
			testName,
			provider,
			documentType: "MediumDocumentMap",
			driverEndpointName: provider.driver.endpointName,
			driverType: provider.driver.type,
		});
		await documentCreator.initializeDocument();
		assert(documentCreator.mainContainer !== undefined, "mainContainer needs to be defined.");
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = testName;
			container: IContainer | undefined;
			async run() {
				this.container = await documentCreator.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				this.container.close();
			}
			beforeIteration() {
				this.container = undefined;
			}
		})(),
	);
});
