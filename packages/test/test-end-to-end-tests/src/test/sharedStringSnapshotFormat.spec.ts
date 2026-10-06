/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	DataObjectFactoryType,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	getContainerEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const stringId = "sharedStringKey";
const snapshotFormatConfig = "Fluid.Sequence.newMergeTreeSnapshotFormat";

function getSummaryTree(summary: ISummaryTree, path: readonly string[]): ISummaryTree {
	let tree = summary;
	for (const key of path) {
		const child = tree.tree[key];
		assert(child?.type === SummaryType.Tree, `Expected summary tree at ${key}`);
		tree = child;
	}
	return tree;
}

function readSummaryBlob(summary: ISummaryTree, key: string): unknown {
	const blob = summary.tree[key];
	assert(blob?.type === SummaryType.Blob, `Expected summary blob at ${key}`);
	assert(typeof blob.content === "string");
	return JSON.parse(blob.content);
}

function assertSummaryFormat(
	summary: ISummaryTree,
	dataStoreId: string,
	channelId: string,
	useFlatFormat: boolean,
): void {
	const channel = getSummaryTree(summary, [".channels", dataStoreId, ".channels", channelId]);
	const attributes = readSummaryBlob(channel, ".attributes");
	assert(typeof attributes === "object" && attributes !== null);
	assert.equal("newMergeTreeSnapshotFormat" in attributes, false);

	const content = getSummaryTree(channel, ["content"]);
	const chunk = readSummaryBlob(content, "header");
	assert(typeof chunk === "object" && chunk !== null);
	assert.equal(
		"version" in chunk ? chunk.version : undefined,
		useFlatFormat ? "1" : undefined,
	);
	assert.equal("segments" in chunk, useFlatFormat);
	assert.equal("segmentTexts" in chunk, !useFlatFormat);
	if (useFlatFormat) {
		assert.equal(content.tree.catchupOps, undefined);
	}
}

describeCompat("SharedString snapshot format", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	function createConfig(flag: boolean | undefined): ITestContainerConfig {
		return {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: [[stringId, SharedString.getFactory()]],
			loaderProps: {
				configProvider: createTestConfigProvider({ [snapshotFormatConfig]: flag }),
			},
			runtimeOptions: {
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
			},
		};
	}

	for (const initialFlag of [false, true]) {
		it(`retains ${initialFlag ? "flat" : "legacy"} selection and explicit overrides through summary reloads`, async () => {
			let container = await provider.makeTestContainer(createConfig(initialFlag));
			await waitForContainerConnection(container);
			let dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			let sharedString = await dataObject.getSharedObject<SharedString>(stringId);
			let summaryVersion: string | undefined;
			let previousFormat = initialFlag;
			let expectedText = "";

			for (const [index, explicitFlag] of [
				initialFlag,
				undefined,
				!initialFlag,
				undefined,
			].entries()) {
				const { summarizer } = await createSummarizer(
					provider,
					container,
					{ ...createConfig(explicitFlag), runtimeOptions: undefined },
					summaryVersion,
				);
				const text = `${index}`;
				sharedString.insertText(sharedString.getLength(), text);
				expectedText += text;
				await provider.ensureSynchronized();

				const summary = await summarizeNow(summarizer);
				const expectedFlag = explicitFlag ?? previousFormat;
				assertSummaryFormat(
					summary.summaryTree,
					dataObject.context.id,
					sharedString.id,
					expectedFlag,
				);
				summarizer.close();

				const loaded = await provider.loadTestContainer(createConfig(undefined), {
					[LoaderHeader.version]: summary.summaryVersion,
				});
				const loadedObject = await getContainerEntryPointBackCompat<ITestFluidObject>(loaded);
				const loadedString = await loadedObject.getSharedObject<SharedString>(stringId);
				assert.equal(loadedString.getText(), expectedText);
				assert.equal("newMergeTreeSnapshotFormat" in loadedString.attributes, false);

				container.close();
				container = loaded;
				dataObject = loadedObject;
				sharedString = loadedString;
				summaryVersion = summary.summaryVersion;
				previousFormat = expectedFlag;
			}
			container.close();
		}).timeout(10000);
	}
});
