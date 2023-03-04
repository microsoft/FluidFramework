/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeE2EDocs, DescribeE2EDocInfo } from "@fluidframework/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

describeE2EDocs(
	"Load Document - runtime benchmarks",
	(getTestObjectProvider, getDocumentInfo) => {
		let documentMap: DocumentMap;
		let provider: ITestObjectProvider;
		let docData: DescribeE2EDocInfo | undefined;

		before(async () => {
			provider = getTestObjectProvider();
			assert(getDocumentInfo !== undefined, "documentType needs to be defined.");
			docData = getDocumentInfo();

			documentMap = DocumentCreator.create({
				testName: docData.testTitle,
				provider,
				documentType: docData.documentType,
				driverEndpointName: provider.driver.endpointName,
				driverType: provider.driver.type,
			});
			await documentMap.initializeDocument();
			assert(documentMap.mainContainer !== undefined, "mainContainer needs to be defined.");
		});

		benchmark({
			title: "Load Document",
			benchmarkFnAsync: async () => {
				const container = await documentMap.loadDocument();
				await provider.ensureSynchronized();
				container.close();
			},
		});
	},
	[
		{
			testTitle: "Load 10Mb document",
			documentType: "LargeDocumentMap",
		},
		{
			testTitle: "Load 5Mb document",
			documentType: "MediumDocumentMap",
		},
	],
);
