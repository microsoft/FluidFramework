/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import {
	describeE2EDocRun,
	describeE2EDocsMemory,
	BenchmarkType,
} from "@fluidframework/test-version-utils";
import { benchmarkFull, createDocument } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Load Document";

describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	const benchmarkType: BenchmarkType =
		describeE2EDocRun === describeE2EDocsMemory ? "E2EMemory" : "E2ETime";

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo(); // returns the type of document to be processed.
		documentMap = createDocument({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		});
		await documentMap.initializeDocument();
	});

	class BenchmarkObj {
		container: IContainer | undefined;
		minSampleCount = 10;
	}

	const obj = new BenchmarkObj();

	benchmarkFull<BenchmarkObj>(scenarioTitle, benchmarkType, {
		run: async () => {
			obj.container = await documentMap.loadDocument();
			assert(obj.container !== undefined, "container needs to be defined.");
			obj.container.close();
		},
		obj,
		beforeIteration: () => {
			if (obj.container !== undefined) {
				obj.container = undefined;
			}
		},
	});
});
