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
import { DocumentMap } from "./DocumentMap";

const testName = "Load a 10Mb document";
describeNoCompat("Load Large Document- memory benchmarks", (getTestObjectProvider) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;

	before(async () => {
		provider = getTestObjectProvider();
		documentMap = DocumentCreator.create({
			testName,
			provider,
			documentType: "LargeDocumentMap",
			driverEndpointName: provider.driver.endpointName,
			driverType: provider.driver.type,
		});
		await documentMap.initializeDocument();
		assert(documentMap.mainContainer !== undefined, "mainContainer needs to be defined.");
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = testName;
			container: IContainer | undefined;
			async run() {
				this.container = await documentMap.loadDocument();
				assert(this.container !== undefined, "container needs to be defined.");
				this.container.close();
			}
			beforeIteration() {
				this.container = undefined;
			}
		})(),
	);
});
