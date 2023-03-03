/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeE2EDocs, DescribeE2EDocInfo } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

describeE2EDocs(
	"Load Document - memory benchmarks",
	(getTestObjectProvider, getDocumentInfo) => {
		let documentMap: DocumentMap;
		let provider: ITestObjectProvider;
		let docData: DescribeE2EDocInfo;

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

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = docData?.testTitle ?? "";
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
	},
	[
		{
			testTitle: "Generate summary tree 10Mb document",
			documentType: "LargeDocumentMap",
		},
		{
			testTitle: "Generate summary tree 5Mb document",
			documentType: "MediumDocumentMap",
		},
	],
);
