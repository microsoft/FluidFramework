/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
	ISummarizeResults,
	ISummarizer,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	ISummaryContext,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { seqFromTree } from "@fluidframework/runtime-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: { state: "disabled" },
	},
};
export const TestDataObjectType1 = "@fluid-example/test-dataStore1";

/**
 * Validates the scenario in which we always retrieve the latest snapshot.
 */
describeCompat(
	"Summarizer fetches expected number of times",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMatrix } = apis.dds;
		const { DataObject, DataObjectFactory } = apis.dataRuntime;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

		class TestDataObject1 extends DataObject {
			public get _root() {
				return this.root;
			}

			public get _context() {
				return this.context;
			}

			private readonly matrixKey = "SharedMatrix";
			public matrix!: SharedMatrix;

			protected async initializingFirstTime() {
				const sharedMatrix = SharedMatrix.create(this.runtime, this.matrixKey);
				this.root.set(this.matrixKey, sharedMatrix.handle);
				sharedMatrix.insertRows(0, 3);
				sharedMatrix.insertCols(0, 3);
			}

			protected async hasInitialized() {
				const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
				assert(matrixHandle !== undefined, "SharedMatrix not found");
				this.matrix = await matrixHandle.get();
			}
		}

		const dataStoreFactory1 = new DataObjectFactory(
			TestDataObjectType1,
			TestDataObject1,
			[SharedMatrix.getFactory()],
			[],
			[],
		);

		const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
		]);

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory: dataStoreFactory1,
				registryEntries: registryStoreEntries,
				runtimeOptions,
			},
		);

		async function createSummarizer(
			testObjectProvider: ITestObjectProvider,
			container: IContainer,
			summaryVersion?: string,
		): Promise<ISummarizer> {
			const createSummarizerResult = await createSummarizerFromFactory(
				testObjectProvider,
				container,
				dataStoreFactory1,
				summaryVersion,
				ContainerRuntimeFactoryWithDefaultDataStore,
				registryStoreEntries,
			);
			return createSummarizerResult.summarizer;
		}

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: TestDataObject1;
		const mockLogger = new MockLogger();
		// Create a container for the first client.
		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory, { logger: mockLogger });
		};

		async function waitForSummary(summarizer: ISummarizer) {
			// Wait for all pending ops to be processed by all clients.
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return {
				summaryVersion: summaryResult.summaryVersion,
				summaryRefSeq: summaryResult.summaryRefSeq,
			};
		}

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			mainContainer = await createContainer();

			mainDataStore = (await mainContainer.getEntryPoint()) as TestDataObject1;
			mainDataStore._root.set("test", "value");
			await waitForContainerConnection(mainContainer);
		});

		function getAndIncrementCellValue(
			sharedMatrix: SharedMatrix<string>,
			row: number,
			column: number,
			initialValue?: string,
		): number {
			const cellValue = sharedMatrix.getCell(row, column);
			if (!cellValue) {
				assert(initialValue, "Initial Value should be valid for the scenario");
				sharedMatrix.setCell(row, column, initialValue);
				return parseInt(initialValue, 10);
			} else {
				let newVal = parseInt(cellValue, 10);
				newVal++;
				sharedMatrix.setCell(row, column, newVal.toString());
				return newVal;
			}
		}

		interface GetVersionWrap {
			/** The reference sequence number of the submitted summary. */
			summaryRefSeq: number;
			/** The version number of the submitted summary. */
			summaryVersion: string | null;
			/** Number of times snapshot is fetched from the server when submitting a summary. */
			fetchCount: number;
			/** The referenced sequence number of the last fetched snapshot when submitting a summary. */
			fetchSnapshotRefSeq: number;
		}

		async function incrementCellValueAndRunSummary(
			summarizer: ISummarizer,
			expectedMatrixCellValue: number,
		): Promise<GetVersionWrap> {
			let fetchCount: number = 0;
			let fetchSnapshotRefSeq = -1;
			// let summaryCount: number = 0;
			const value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0, "1");
			assert(value === expectedMatrixCellValue, "Value matches expected");

			const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
			const readAndParseBlob = async <T>(id: string) =>
				readAndParse<T>(containerRuntime.storage, id);
			let getSnapshotTreeFunc = containerRuntime.storage.getSnapshotTree;
			const getSnapshotTreeOverride = async (
				version?: IVersion,
				scenarioName?: string,
			): Promise<ISnapshotTree | null> => {
				getSnapshotTreeFunc = getSnapshotTreeFunc.bind(containerRuntime.storage);
				const snapshotTree = await getSnapshotTreeFunc(version, scenarioName);
				assert(snapshotTree !== null, "getSnapshotTree should did not return a tree");
				fetchSnapshotRefSeq = await seqFromTree(snapshotTree, readAndParseBlob);
				fetchCount++;
				return snapshotTree;
			};
			containerRuntime.storage.getSnapshotTree = getSnapshotTreeOverride;

			// Generate first Summary and close the summarizer.
			const summaryResult = await waitForSummary(summarizer);
			assert(summaryResult.summaryVersion, "Summary version should be defined");
			return { fetchCount, fetchSnapshotRefSeq, ...summaryResult };
		}

		it("First Summary does not result in fetch", async () => {
			const summarizer1 = await createSummarizer(provider, mainContainer);

			const versionWrap = await incrementCellValueAndRunSummary(
				summarizer1,
				1 /* expectedMatrixCellValue */,
			);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			summarizer1.close();
		});

		it("Summarizing consecutive times should not fetch", async () => {
			const summarizer1 = await createSummarizer(provider, mainContainer);

			let versionWrap = await incrementCellValueAndRunSummary(
				summarizer1,
				1 /* expectedMatrixCellValue */,
			);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");

			versionWrap = await incrementCellValueAndRunSummary(
				summarizer1,
				2 /* expectedMatrixCellValue */,
			);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");

			// Create 5 data stores and add their handles to mark it as referenced.
			const dataStore2 = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);
			const dataStore3 = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);
			const dataStore4 = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);
			const dataStore5 = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);
			const dataStore6 = await dataStoreFactory1.createInstance(
				mainDataStore._context.containerRuntime,
			);

			mainDataStore._root.set("dataStore2", dataStore2.handle);
			mainDataStore._root.set("dataStore3", dataStore3.handle);
			mainDataStore._root.set("dataStore4", dataStore4.handle);
			mainDataStore._root.set("dataStore5", dataStore5.handle);
			mainDataStore._root.set("dataStore6", dataStore6.handle);

			versionWrap = await incrementCellValueAndRunSummary(
				summarizer1,
				3 /* expectedMatrixCellValue */,
			);
			assert(versionWrap.fetchCount === 0, "No fetch should have happened");
			await provider.ensureSynchronized();
			summarizer1.close();
		});

		it("Second summarizer from latest should not fetch", async function () {
			// TODO: This test is consistently failing when ran against FRS. See ADO:7894
			if (
				provider.driver.type === "routerlicious" &&
				provider.driver.endpointName === "frs"
			) {
				this.skip();
			}
			const summarizer1 = await createSummarizer(provider, mainContainer);

			const versionWrap1 = await incrementCellValueAndRunSummary(
				summarizer1,
				1 /* expectedMatrixCellValue */,
			);
			assert(versionWrap1.fetchCount === 0, "No fetch should have happened");

			const versionWrap2 = await incrementCellValueAndRunSummary(
				summarizer1,
				2 /* expectedMatrixCellValue */,
			);
			assert(versionWrap2.fetchCount === 0, "No fetch should have happened");
			await provider.ensureSynchronized();
			summarizer1.close();

			const value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0, "1");
			assert(value === 3, "Value matches expected");

			const summarizer2 = await createSummarizer(provider, mainContainer);
			const versionWrap3 = await incrementCellValueAndRunSummary(
				summarizer2,
				4 /* expectedMatrixCellValue */,
			);
			// Only ODSP driver uses snapshot cache due to which the summarizer would have loaded from an older summary.
			if (provider.driver.type === "odsp") {
				assert(versionWrap3.fetchCount === 1, "Fetch should have happened");
				assert.strictEqual(
					versionWrap3.fetchSnapshotRefSeq,
					versionWrap2.summaryRefSeq,
					"Fetch did not download latest snapshot",
				);
			} else {
				assert(versionWrap3.fetchCount === 0, "Fetch should have happened");
			}

			const versionWrap4 = await incrementCellValueAndRunSummary(
				summarizer2,
				5 /* expectedMatrixCellValue */,
			);
			assert(versionWrap4.fetchCount === 0, "No fetch should have happened");
			summarizer2.close();
		});

		it("Loading Summary from older version should fetch", async function () {
			// TODO: This test is consistently failing when ran against FRS. See ADO:7895
			if (
				provider.driver.type === "routerlicious" &&
				provider.driver.endpointName === "frs"
			) {
				this.skip();
			}
			const summarizerClient = await createSummarizer(provider, mainContainer);
			const versionWrap1 = await incrementCellValueAndRunSummary(
				summarizerClient,
				1 /* expectedMatrixCellValue */,
			);
			assert(versionWrap1.fetchCount === 0, "No fetch should have happened");
			assert(versionWrap1.summaryVersion, "Summary version should be defined");
			summarizerClient.close();

			// Add more summaries and we can have more recent ones.
			const secondSummarizer = await createSummarizer(provider, mainContainer);
			const versionWrap2 = await incrementCellValueAndRunSummary(
				secondSummarizer,
				2 /* expectedMatrixCellValue */,
			);
			// Only ODSP driver uses snapshot cache due to which the summarizer would have loaded from an older summary.
			if (provider.driver.type === "odsp") {
				assert(versionWrap2.fetchCount === 1, "Fetch should have happened");
				assert.strictEqual(
					versionWrap2.fetchSnapshotRefSeq,
					versionWrap1.summaryRefSeq,
					"Fetch did not download latest snapshot",
				);
			} else {
				assert(versionWrap2.fetchCount === 0, "Fetch should have happened");
			}

			const versionWrap3 = await incrementCellValueAndRunSummary(
				secondSummarizer,
				3 /* expectedMatrixCellValue */,
			);
			assert(versionWrap3.fetchCount === 0, "No fetch should have happened");
			await provider.ensureSynchronized();
			secondSummarizer.close();

			// Load summarizer from previous version triggers fetch.
			const newSummarizerClient = await createSummarizer(provider, mainContainer);
			const versionWrap4 = await incrementCellValueAndRunSummary(
				newSummarizerClient,
				4 /* expectedMatrixCellValue */,
			);
			assert(versionWrap4.summaryVersion, "Summarizer should have happened");
			// Only ODSP driver uses snapshot cache due to which the summarizer would have loaded from an older summary.
			if (provider.driver.type === "odsp") {
				assert(versionWrap4.fetchCount === 1, "Fetch should have happened");
				assert.strictEqual(
					versionWrap4.fetchSnapshotRefSeq,
					versionWrap3.summaryRefSeq,
					"Fetch did not download latest snapshot",
				);
			} else {
				assert(versionWrap4.fetchCount === 0, "Fetch should have happened");
			}
			newSummarizerClient.close();
		});

		itExpects(
			"Summarizer succeeds after Summarizer fails",
			[{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" }],
			async () => {
				// Create new summarizer
				const summarizer = await createSummarizer(provider, mainContainer);

				// Second summary should be discarded
				const containerRuntime = (summarizer as any).runtime as ContainerRuntime;
				let uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
				let lastSummaryVersion: string | undefined;
				const func = async (summary: ISummaryTree, context: ISummaryContext) => {
					uploadSummaryUploaderFunc = uploadSummaryUploaderFunc.bind(
						containerRuntime.storage,
					);
					const response = await uploadSummaryUploaderFunc(summary, context);
					// Close summarizer so that it does not submit SummaryOp
					summarizer.close();
					// ODSP has single commit summary enabled by default and
					// will update the summary version even without the summary op.
					if (provider.driver.type === "odsp") {
						lastSummaryVersion = response;
					}
					return response;
				};
				containerRuntime.storage.uploadSummaryWithContext = func;

				const result2: ISummarizeResults = summarizer.summarizeOnDemand({
					reason: "test2",
				});
				assert((await result2.summarySubmitted).success === false, "Summary should fail");
				await provider.ensureSynchronized();

				const value = getAndIncrementCellValue(mainDataStore.matrix, 0, 0, "1");
				assert(value === 1, "Value matches expected");

				const secondSummarizer = await createSummarizer(
					provider,
					mainContainer,
					lastSummaryVersion,
				);
				let versionWrap = await incrementCellValueAndRunSummary(
					secondSummarizer,
					2 /* expectedMatrixCellValue */,
				);
				assert(versionWrap.fetchCount === 0, "No fetch should have happened");

				versionWrap = await incrementCellValueAndRunSummary(
					secondSummarizer,
					3 /* expectedMatrixCellValue */,
				);
				assert(versionWrap.fetchCount === 0, "No fetch should have happened");
				await provider.ensureSynchronized();
				secondSummarizer.close();
			},
		);
	},
);
