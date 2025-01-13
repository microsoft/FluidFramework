/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import {
	ISummaryBlob,
	SummaryType,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

const defaultDataStoreId = "default";
const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		summaryOptions: {
			initialSummarizerDelayMs: 0, // back-compat - Old runtime takes 5 seconds to start summarizer without thi
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{ maxOps: 10, initialSummarizerDelayMs: 0, minIdleTime: 10, maxIdleTime: 10 },
			},
		},
	},
};

function readBlobContent(content: ISummaryBlob["content"]): unknown {
	const json = typeof content === "string" ? content : bufferToString(content, "utf8");
	return JSON.parse(json);
}

describeCompat("Summarization - runtime benchmarks", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;

	before(async () => {
		provider = getTestObjectProvider();
		const loader = provider.makeTestLoader(testContainerConfig);
		mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);
		await mainContainer.attach(provider.driver.createCreateNewRequest());
	});

	benchmark({
		title: "Generate summary tree",
		benchmarkFnAsync: async () => {
			const defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			const containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;

			await provider.ensureSynchronized();

			const { stats, summary } = await containerRuntime.summarize({
				runGC: false,
				fullTree: true,
			});

			// Validate stats
			assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
			// .metadata, .component, and .attributes blobs
			assert(
				stats.blobNodeCount >= 3,
				`Stats expected at least 3 blob nodes, but had ${stats.blobNodeCount}.`,
			);
			// root node, data store .channels, default data store, dds .channels, and default root dds
			assert(
				stats.treeNodeCount >= 5,
				`Stats expected at least 5 tree nodes, but had ${stats.treeNodeCount}.`,
			);

			// Validate summary
			assert(!summary.unreferenced, "Root summary should be referenced.");

			assert(
				summary.tree[".metadata"]?.type === SummaryType.Blob,
				"Expected .metadata blob in summary root.",
			);
			const metadata = readBlobContent(summary.tree[".metadata"]?.content) as Record<
				string,
				unknown
			>;
			assert(
				metadata.summaryFormatVersion === 1,
				"Metadata blob should have summaryFormatVersion 1",
			);
			assert(
				metadata.disableIsolatedChannels === undefined,
				"Unexpected metadata blob disableIsolatedChannels",
			);

			const channelsTree: SummaryObject | undefined = summary.tree[channelsTreeName];
			assert(
				channelsTree?.type === SummaryType.Tree,
				"Expected .channels tree in summary root.",
			);

			const defaultDataStoreNode: SummaryObject | undefined =
				channelsTree.tree[defaultDataStore._context.id];
			assert(
				defaultDataStoreNode?.type === SummaryType.Tree,
				"Expected default data store tree in summary.",
			);
			assert(!defaultDataStoreNode.unreferenced, "Default data store should be referenced.");
			assert(
				defaultDataStoreNode.tree[".component"]?.type === SummaryType.Blob,
				"Expected .component blob in default data store summary tree.",
			);
			const dataStoreChannelsTree: SummaryObject | undefined =
				defaultDataStoreNode.tree[channelsTreeName];
			const attributes = readBlobContent(
				defaultDataStoreNode.tree[".component"]?.content,
			) as Record<string, unknown>;
			assert(
				attributes.snapshotFormatVersion === undefined,
				"Unexpected datastore attributes snapshotFormatVersion",
			);
			assert(
				attributes.summaryFormatVersion === 2,
				"Datastore attributes summaryFormatVersion should be 2",
			);
			assert(
				attributes.disableIsolatedChannels === undefined,
				"Unexpected datastore attributes disableIsolatedChannels",
			);
			assert(
				dataStoreChannelsTree?.type === SummaryType.Tree,
				"Expected .channels tree in default data store.",
			);

			const defaultDdsNode: SummaryObject | undefined = dataStoreChannelsTree.tree.root;
			assert(
				defaultDdsNode?.type === SummaryType.Tree,
				"Expected default root DDS in summary.",
			);
			assert(!defaultDdsNode.unreferenced, "Default root DDS should be referenced.");
			assert(
				defaultDdsNode.tree[".attributes"]?.type === SummaryType.Blob,
				"Expected .attributes blob in default root DDS summary tree.",
			);
		},
	});
});
