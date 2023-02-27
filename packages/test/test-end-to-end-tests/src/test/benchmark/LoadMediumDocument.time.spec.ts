/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";

const testName = "Load a 5Mb document";
describeNoCompat("Load Medium Document- runtime benchmarks", (getTestObjectProvider) => {
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

	benchmark({
		title: testName,
		benchmarkFnAsync: async () => {
			const container = await documentCreator.loadDocument();
			await provider.ensureSynchronized();
			container.close();
		},
	});
});
