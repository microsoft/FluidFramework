/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

/**
 * These tests validate the behavior of the summarizer when it gets summary acks that are newer than the summary
 * it knows about.
 */
describeCompat("Summarization - lost snapshot", "NoCompat", (getTestObjectProvider) => {
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
	};
	const configProvider = createTestConfigProvider();

	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
		configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 0);
	});

	afterEach(() => {
		configProvider.clear();
	});

	interface IHackableCollection {
		deleteOne(query: { _id: string }): void;
	}

	interface IHackableHistorian {
		readonly trees: IHackableCollection;
		readonly commits: IHackableCollection;
		updateRef(ref: string, params: { sha: string }): void;
	}

	interface IHackableGitManager {
		readonly historian: IHackableHistorian;
	}

	interface IHackLocalDocumentStorageService extends IDocumentStorageService {
		readonly manager: IHackableGitManager;
	}

	itExpects(
		"lost a snapshot but summary ack and op are still in op stream",
		[{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" }],
		async () => {
			const container1 = await provider.makeTestContainer(testContainerConfig);
			const defaultDataStore = (await container1.getEntryPoint()) as ITestDataObject;
			defaultDataStore._root.set("1", "2");

			const summarizer1 = await createSummarizer(provider, container1, {
				loaderProps: { configProvider },
			});

			const containerRuntime1 = defaultDataStore._context.containerRuntime as ContainerRuntime;
			const localDocumentStorageService = (containerRuntime1.storage as any)._storageService
				.internalStorageService
				.internalStorageService as unknown as IHackLocalDocumentStorageService;

			// Get original snapshot
			const versions = await localDocumentStorageService.getVersions(null, 10);
			const originalVersion = versions[0];

			const { summaryVersion } = await summarizeNow(summarizer1.summarizer);
			await provider.ensureSynchronized();

			// Delete server snapshot (local server specific implementation)
			const gitManager = localDocumentStorageService.manager;
			const historian = gitManager.historian;
			historian.trees.deleteOne({ _id: summaryVersion });
			historian.commits.deleteOne({ _id: summaryVersion });
			historian.updateRef(`heads/${provider.documentId}`, { sha: originalVersion.treeId });

			summarizer1.container.close();
			await provider.ensureSynchronized();

			const container2 = await provider.loadTestContainer(testContainerConfig);
			const defaultDataStore2 = (await container2.getEntryPoint()) as ITestDataObject;
			const containerRuntime2 = defaultDataStore2._context
				.containerRuntime as ContainerRuntime;
			assert(containerRuntime2.deltaManager.initialSequenceNumber === 0, "wrong snapshot");

			const summarizer2 = await createSummarizer(provider, container1, {
				loaderProps: { configProvider },
			});
			await provider.ensureSynchronized();
			const summaryOnDemand = summarizer2.summarizer.summarizeOnDemand({ reason: "test" });
			const summarySubmitted = await summaryOnDemand.summarySubmitted;
			assert(!summarySubmitted.success, "expected failure");
			assert(summarySubmitted.error.message === "disconnected", "expected error");
			assert(
				summarizer2.container.closed,
				"Summarizer container should dispose after fetching newer ack",
			);
		},
	);
});
