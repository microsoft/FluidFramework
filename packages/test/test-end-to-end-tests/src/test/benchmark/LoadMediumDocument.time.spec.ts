/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const testName = "Load a 5Mb document";
describeNoCompat("Load Medium Document- runtime benchmarks", (getTestObjectProvider) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;

	before(async () => {
		provider = getTestObjectProvider();

		documentMap = DocumentCreator.create({
			testName,
			provider,
			documentType: "MediumDocumentMap",
			driverEndpointName: provider.driver.endpointName,
			driverType: provider.driver.type,
		});
		await documentMap.initializeDocument();
		assert(documentMap.mainContainer !== undefined, "mainContainer needs to be defined.");
	});

	benchmark({
		title: testName,
		benchmarkFnAsync: async () => {
			const container = await documentMap.loadDocument();
			await provider.ensureSynchronized();
			container.close();
		},
	});
});
