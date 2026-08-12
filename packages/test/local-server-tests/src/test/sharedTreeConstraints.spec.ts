/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { loadExistingContainer } from "@fluidframework/container-loader/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	createAndAttachContainerUsingProps,
	type ITestFluidObject,
	LoaderContainerTracker,
	TestFluidObjectFactory,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
// This import should be updated to beta/public once the relevant transaction & constraint APIs are stabilized.
import {
	asAlpha,
	CommitOutcome,
	FluidClientVersion,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";
import { configuredSharedTree } from "@fluidframework/tree/internal";

import { createLoader } from "./utils.js";

describe("SharedTree transaction constraints", () => {
	// This is a regression test for an issue where commit enrichment did not appropriately propagate constraint metadata.
	// It is intentionally a bit particular about delta manager queue choreography to ensure that it exercises that enrichment code path.
	it("respects noChange constraints across op resubmission", async () => {
		const treeId = "tree";
		const schemaFactory = new SchemaFactory("sharedTreeConstraintTest");
		class StringArray extends schemaFactory.array("StringArray", schemaFactory.string) {}
		const viewConfiguration = new TreeViewConfiguration({ schema: StringArray });
		const sharedTree = configuredSharedTree({
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const dataStoreFactory = new TestFluidObjectFactory(
			[[treeId, sharedTree.getFactory()]],
			"default",
		);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataStoreFactory,
			registryEntries: [[dataStoreFactory.type, dataStoreFactory]],
			runtimeOptions: { enableRuntimeIdCompressor: "on" },
		});
		const { codeDetails, loaderProps, urlResolver } = createLoader({
			deltaConnectionServer,
			defaultDataStoreFactory: dataStoreFactory,
			runtimeFactory,
		});
		const tracker = new LoaderContainerTracker();

		const getTreeView = async (
			container: IContainer,
		): Promise<TreeViewAlpha<typeof StringArray>> => {
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const tree = await dataObject.getSharedObject<ITree>(treeId);
			return asAlpha(tree.viewWith(viewConfiguration));
		};

		try {
			const containerA = await createAndAttachContainerUsingProps(
				{ ...loaderProps, codeDetails },
				urlResolver.createCreateNewRequest("shared-tree-constraint-resubmit"),
			);
			tracker.addContainer(containerA);
			const viewA = await getTreeView(containerA);
			viewA.initialize(["initial"]);
			await tracker.ensureSynchronized();

			const url = await containerA.getAbsoluteUrl("");
			assert(url !== undefined, "container should have a URL after attach");
			const containerB = await loadExistingContainer({
				...loaderProps,
				request: { url },
			});
			tracker.addContainer(containerB);
			const viewB = await getTreeView(containerB);

			const settledOutcome = new Promise<CommitOutcome>((resolve) => {
				const unsubscribe = viewA.events.on("changed", (metadata) => {
					if (metadata.isLocal) {
						unsubscribe();
						metadata.events.on("settled", resolve);
					}
				});
			});

			const disconnected = new Promise<void>((resolve) => {
				containerA.once("disconnected", () => resolve());
			});

			const deltaManagerA = toIDeltaManagerFull(containerA.deltaManager);
			await deltaManagerA.outbound.pause();
			viewA.runTransaction(
				() => {
					viewA.root.insertAtEnd("constrained");
				},
				{ preconditions: [{ type: "noChange" }] },
			);
			assert.deepEqual([...viewA.root], ["initial", "constrained"]);

			containerA.disconnect();
			await disconnected;

			containerA.connect();
			await waitForContainerConnection(containerA);
			await deltaManagerA.inbound.pause();

			// Sequence B's edit first while A is unable to rebase its pending transaction.
			viewB.root.insertAtEnd("sequenced");
			await tracker.ensureSynchronized(containerB);
			assert.deepEqual([...viewB.root], ["initial", "sequenced"]);

			deltaManagerA.outbound.resume();
			await deltaManagerA.outbound.waitTillProcessingDone();
			deltaManagerA.inbound.resume();
			await tracker.ensureSynchronized();

			assert.deepEqual(
				{
					outcome: await settledOutcome,
					clientA: [...viewA.root],
					clientB: [...viewB.root],
				},
				{
					outcome: CommitOutcome.NewContentOnly,
					clientA: ["initial", "sequenced"],
					clientB: ["initial", "sequenced"],
				},
			);
		} finally {
			tracker.reset();
			await deltaConnectionServer.webSocketServer.close();
		}
	});
});
