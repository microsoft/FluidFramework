/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { loadExistingContainer } from "@fluidframework/container-loader/internal";
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
import { asAlpha, CommitOutcome, FluidClientVersion } from "@fluidframework/tree/alpha";
import { configuredSharedTree } from "@fluidframework/tree/internal";

import { createLoader } from "./utils.js";

describe("SharedTree transaction constraints", () => {
	it("does not apply a noChange-constrained transaction resubmitted after a sequenced edit", async () => {
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
			registryEntries: [[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]],
			runtimeOptions: { enableRuntimeIdCompressor: "on" },
		});
		const { codeDetails, loaderProps, urlResolver } = createLoader({
			deltaConnectionServer,
			defaultDataStoreFactory: dataStoreFactory,
			runtimeFactory,
		});
		const tracker = new LoaderContainerTracker();

		try {
			const containerA = await createAndAttachContainerUsingProps(
				{ ...loaderProps, codeDetails },
				urlResolver.createCreateNewRequest("shared-tree-constraint-resubmit"),
			);
			tracker.addContainer(containerA);
			const dataObjectA = (await containerA.getEntryPoint()) as ITestFluidObject;
			const treeA = await dataObjectA.getSharedObject<ITree>(treeId);
			const viewA = asAlpha(treeA.viewWith(viewConfiguration));
			viewA.initialize(["initial"]);
			await tracker.ensureSynchronized();

			const url = await containerA.getAbsoluteUrl("");
			assert(url !== undefined, "container should have a URL after attach");
			const containerB = await loadExistingContainer({
				...loaderProps,
				request: { url },
			});
			tracker.addContainer(containerB);
			const dataObjectB = (await containerB.getEntryPoint()) as ITestFluidObject;
			const treeB = await dataObjectB.getSharedObject<ITree>(treeId);
			const viewB = asAlpha(treeB.viewWith(viewConfiguration));

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
			// Enrich and submit the transaction locally, but keep its op pending for resubmission.
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
