/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import type { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

/**
 * Reproduces a summarizer bug that occurs when a data store is realized on the summarizer in the
 * window *between* a summary being generated / uploaded and that summary being acked (refreshed).
 *
 * Scenario (modeled on a real application):
 *
 * - A "table" data object (the default / root data store) holds handles to "cell" data stores. Its
 * application logic loads (realizes) any cell whose handle is added to it by another client.
 *
 * - A new cell data store is created and attached such that its attach op reaches the summarizer
 * *after* the summary's reference sequence number is fixed but *before* the summary is acked.
 *
 * - Because the table eagerly loads cells, the summarizer realizes the newly attached cell - creating
 * summarizer nodes for its DDSes - before the summary is refreshed.
 *
 * With the bug present, the cell's DDS summarizer node ends up tracking a reference sequence number
 * for a summary in which its content was not directly written. On the next summary it emits a summary
 * handle pointing to a path that the storage service cannot resolve, and the summary upload fails (in
 * production this surfaces as a 404 "fluidElementNotFound").
 */
describeCompat(
	"GC reference updates from attach message with root DDS in snapshot",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedTree } = apis.dds;
		const { DataObject, DataObjectFactory } = apis.dataRuntime;
		const { mixinSummaryHandler } = apis.dataRuntime.packages.datastore;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

		// A "cell" data object. Its first-time initialization creates an extra DDS so that its attach
		// snapshot contains multiple DDSes (its root SharedDirectory plus this one).
		class CellDataObject extends DataObject {
			public get _root(): ISharedDirectory {
				return this.root;
			}
			public get _context(): IFluidDataStoreContext {
				return this.context;
			}
			protected async initializingFirstTime(): Promise<void> {
				const tree = SharedTree.create(this.runtime);
				this.root.set("tree", tree.handle);
			}
		}

		// A "table" data object (the default data store). It mimics a real application that eagerly loads
		// any cell whose handle is added to it by another client.
		class TableDataObject extends DataObject {
			public get _root(): ISharedDirectory {
				return this.root;
			}
			public get containerRuntime(): IContainerRuntimeBase {
				return this.context.containerRuntime;
			}
			protected async hasInitialized(): Promise<void> {
				// App-style op handler: whenever a cell's handle is added to the table, load (realize) that
				// cell. On the summarizer this realizes a newly attached cell - and creates its DDS summarizer
				// nodes - as soon as the attach op is processed (between summarize and refresh).
				this.root.on("valueChanged", (changed) => {
					const value = this.root.get(changed.key);
					if (
						value !== undefined &&
						typeof (value as Partial<IFluidHandle>).get === "function"
					) {
						// Fire-and-forget load, as a real app would do.
						(value as IFluidHandle).get().catch(() => {});
					}
				});
			}
		}

		// Handler passed to mixinSummaryHandler below. It loads (realizes) the data object during
		// summarize, which runs the object's hasInitialized and installs the op handler above on the
		// summarizer (which otherwise would not realize the table on its own).
		const getDataObject = async (runtime: FluidDataStoreRuntime): Promise<undefined> => {
			await DataObject.getDataObject(runtime);
			return undefined;
		};

		const cellFactory = new DataObjectFactory({
			type: "CellDataObject",
			ctor: CellDataObject,
			sharedObjects: [SharedTree.getFactory()],
		});
		const tableFactory = new DataObjectFactory({
			type: "TableDataObject",
			ctor: TableDataObject,
			// mixinSummaryHandler ensures the table is initialized on the summarizer.
			// This is important because the table's op handler (which realizes newly attached cells)
			// must be set up to repro the bug.
			runtimeClass: mixinSummaryHandler(getDataObject),
			registryEntries: [[cellFactory.type, Promise.resolve(cellFactory)]],
		});
		const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
			[tableFactory.type, Promise.resolve(tableFactory)],
			[cellFactory.type, Promise.resolve(cellFactory)],
		]);
		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory: tableFactory,
				registryEntries: registry,
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
					summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
				},
			},
		);

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let tableDataObject: TableDataObject;

		beforeEach("setup", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// This test calls summarize directly on the summarizer container. It doesn't need to run
			// against real services.
			if (provider.driver.type !== "local") {
				this.skip();
			}

			mainContainer = await provider.createContainer(runtimeFactory);
			tableDataObject = (await mainContainer.getEntryPoint()) as TableDataObject;
			await waitForContainerConnection(mainContainer);
		});

		it("realizes an attached data store between summarize and refresh via the app's data store loader (prod-like)", async () => {
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				mainContainer,
				tableFactory,
				undefined /* summaryVersion */,
				ContainerRuntimeFactoryWithDefaultDataStore,
				registry,
			);

			// Baseline summary. During this, mixinSummaryHandler realizes the table on the summarizer,
			// installing its op handler so it will later load newly attached cells.
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// Create a new cell data store (still local - not yet attached). Its first-time init creates an
			// extra DDS, so its attach snapshot will contain multiple DDSes.
			const cellContext = await tableDataObject.containerRuntime.createDataStore(
				cellFactory.type,
			);
			const cellDataObject = (await cellContext.entryPoint.get()) as CellDataObject;

			// Override the summarizer's summary upload so we can attach the cell at a precise moment.
			// submitSummary pauses the summarizer's inbound queue, generates + uploads the summary, then
			// submits the summarize op. Attaching the cell during upload (and flushing its op to the server)
			// sequences the attach op before the summarize op - and therefore before the ack. So the
			// summarizer processes the attach op between summarize and refresh; the table's op handler then
			// loads (realizes) the cell, creating its DDS summarizer nodes before refresh. This is exactly
			// what happens in production - no explicit realize call is needed.
			const summarizerRuntime = (summarizer as any).runtime as ContainerRuntime;
			const originalUpload = summarizerRuntime.storage.uploadSummaryWithContext.bind(
				summarizerRuntime.storage,
			);
			summarizerRuntime.storage.uploadSummaryWithContext = async (
				summary: ISummaryTree,
				context: ISummaryContext,
			): Promise<string> => {
				const response = await originalUpload(summary, context);
				tableDataObject._root.set("newCell", cellDataObject.handle);
				// `processOutgoing` ensures that the attach op is sequenced by the server before the summarize op.
				await provider.opProcessingController.processOutgoing(mainContainer);
				return response;
			};

			await summarizeNow(summarizer);

			// Restore the upload override before the final summary.
			summarizerRuntime.storage.uploadSummaryWithContext = originalUpload;

			// With the bug present, the cell's DDS now emits an unresolvable summary handle and this
			// summary's upload fails.
			await provider.ensureSynchronized();
			await assert.doesNotReject(async () => summarizeNow(summarizer));
		});
	},
);
