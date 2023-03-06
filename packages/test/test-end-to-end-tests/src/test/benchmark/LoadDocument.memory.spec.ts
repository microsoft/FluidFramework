/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeE2EDocsMemory } from "@fluidframework/test-version-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { DocumentCreator } from "./DocumentCreator";
import { DocumentMap } from "./DocumentMap";

const scenarioTitle = "Load Document";
describeE2EDocsMemory(scenarioTitle, (getTestObjectProvider, getDocumentInfo) => {
	let documentMap: DocumentMap;
	let provider: ITestObjectProvider;

	before(async () => {
		provider = getTestObjectProvider();
		const docData = getDocumentInfo();
		documentMap = DocumentCreator.create({
			testName: `${scenarioTitle} - ${docData.testTitle}`,
			provider,
			documentType: docData.documentType,
			benchmarkType: "E2EMemory",
		});
		await documentMap.initializeDocument();
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = scenarioTitle;
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
