/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeE2EDocRun, getCurrentBenchmarkType } from "@fluidframework/test-version-utils";
import { benchmarkAll, createDocument } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Load Document";

describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	const benchmarkType = getCurrentBenchmarkType(describeE2EDocRun);

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		documentMap = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		}) as DocumentMap;
		await documentMap.initializeDocument();
	});

	class BenchmarkObj {
		container: IContainer | undefined;
		minSampleCount = 10;
	}

	const obj = new BenchmarkObj();

	benchmarkAll<BenchmarkObj>(scenarioTitle, benchmarkType, {
		run: async () => {
			obj.container = await documentMap.loadDocument();
			assert(obj.container !== undefined, "container needs to be defined.");
			obj.container.close();
		},
		obj,
		beforeIteration: () => {
			obj.container = undefined;
		},
	});
});
