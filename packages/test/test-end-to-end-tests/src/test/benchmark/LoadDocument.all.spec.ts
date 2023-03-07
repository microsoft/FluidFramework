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
import { benchmarkFull, DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Load Document";

describeE2EDocRun(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;
	const benchmarkType: BenchmarkType =
		describeE2EDocRun === describeE2EDocsMemory ? "E2EMemory" : "E2ETime";

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo();
		documentMap = DocumentCreator.create({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType,
		});
		await documentMap.initializeDocument();
	});

	class benchmarkObj {
		container: IContainer | undefined;
		minSampleCount = 10;
	}

	const t = new benchmarkObj();

	benchmarkFull<benchmarkObj>(
		benchmarkType,
		scenarioTitle,
		async () => {
			t.container = await documentMap.loadDocument();
			assert(t.container !== undefined, "container needs to be defined.");
			t.container.close();
		},
		t,
		() => {
			t.container = undefined;
		},
	);
});
