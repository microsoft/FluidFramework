/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { SparseMatrix } from "@fluid-experimental/sequence-deprecated";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import {
	IContainer,
	IFluidCodeDetails,
	DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import type { SharedCounter } from "@fluidframework/counter/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	IDocumentAttributes,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import type { SharedDirectory, ISharedMap } from "@fluidframework/map/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import type { ConsensusOrderedCollection } from "@fluidframework/ordered-collection/internal";
import type { ConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { createDataStoreFactory } from "@fluidframework/runtime-utils/internal";
import type { SequenceInterval, SharedString } from "@fluidframework/sequence/internal";
import {
	ITestFluidObject,
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObject,
	createDocumentId,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";
import * as semver from "semver";

// eslint-disable-next-line import/no-internal-modules
import type { SnapshotWithBlobs } from "../../../../loader/container-loader/lib/serializedStateManager.js";
import { pkgVersion } from "../packageVersion.js";

const detachedContainerRefSeqNumber = 0;

const fluidCodeDetails: IFluidCodeDetails = {
	package: "detachedContainerTestPackage1",
	config: {},
};

// Quorum val transormations
const quorumKey = "code";
const baseQuorum = [
	[
		quorumKey,
		{
			key: quorumKey,
			value: fluidCodeDetails,
			approvalSequenceNumber: 0,
			commitSequenceNumber: 0,
			sequenceNumber: 0,
		},
	],
];

const baseAttributes = {
	minimumSequenceNumber: 0,
	sequenceNumber: 0,
	term: 1,
};

const baseSummarizer = {
	electionSequenceNumber: 0,
};

function buildSummaryTree(attr, quorumVal, summarizer): ISummaryTree {
	return {
		type: SummaryType.Tree,
		tree: {
			".protocol": {
				type: 1,
				tree: {
					quorumMembers: {
						type: SummaryType.Blob,
						content: "[]",
					},
					quorumProposals: {
						type: SummaryType.Blob,
						content: "[]",
					},
					quorumValues: {
						type: SummaryType.Blob,
						content: JSON.stringify(quorumVal),
					},
					attributes: {
						type: SummaryType.Blob,
						content: JSON.stringify(attr),
					},
				},
			},
			".app": {
				type: 1,
				tree: {
					[".channels"]: {
						type: SummaryType.Tree,
						tree: {},
					},
					".metadata": {
						type: 2,
						content: "{}",
					},
					".electedSummarizer": {
						type: 2,
						content: JSON.stringify(summarizer),
					},
				},
			},
		},
	};
}

interface ISerializableBlobContents {
	[id: string]: string;
}

describeCompat(
	`Dehydrate Rehydrate Container Test`,
	"FullCompat",
	(getTestObjectProvider, apis) => {
		const {
			SharedMap,
			SharedDirectory,
			SharedMatrix,
			SharedCounter,
			SharedString,
			SharedCell,
			ConsensusQueue,
			ConsensusRegisterCollection,
			SparseMatrix,
		} = apis.dds;
		function assertSubtree(tree: ISnapshotTree, key: string, msg?: string): ISnapshotTree {
			const subTree: ISnapshotTree | undefined = tree.trees[key];
			assert(subTree, msg ?? `${key} subtree not present`);
			return subTree;
		}

		const assertChannelsTree = (rootOrDatastore: ISnapshotTree) =>
			assertSubtree(rootOrDatastore, ".channels");
		const assertProtocolTree = (root: ISnapshotTree) => assertSubtree(root, ".protocol");

		function assertChannelTree(rootOrDatastore: ISnapshotTree, key: string, msg?: string) {
			const channelsTree = assertChannelsTree(rootOrDatastore);
			return {
				channelsTree,
				datastoreTree: assertSubtree(channelsTree, key, msg ?? `${key} channel not present`),
			};
		}
		const assertDatastoreTree = (root: ISnapshotTree, key: string, msg?: string) =>
			assertChannelTree(root, key, `${key} datastore not present`);

		function assertBlobContents<T>(
			subtree: ISnapshotTree,
			blobs: ISerializableBlobContents,
			key: string,
		): T {
			const id: string | undefined = subtree.blobs[key];
			assert(id, `blob id for ${key} missing`);
			const contents: string | undefined = blobs[id];

			assert(contents, `blob contents for ${key} missing`);
			return JSON.parse(contents) as T;
		}

		const assertProtocolAttributes = (s: ISnapshotTree, b: ISerializableBlobContents) =>
			assertBlobContents<IDocumentAttributes>(assertProtocolTree(s), b, "attributes");

		const codeDetails: IFluidCodeDetails = {
			package: "detachedContainerTestPackage1",
			config: {},
		};
		const sharedStringId = "ss1Key";
		const sharedMapId = "sm1Key";
		const crcId = "crc1Key";
		const cocId = "coc1Key";
		const sharedDirectoryId = "sd1Key";
		const sharedCellId = "scell1Key";
		const sharedMatrixId = "smatrix1Key";
		const sparseMatrixId = "sparsematrixKey";
		const sharedCounterId = "sharedcounterKey";

		let provider: ITestObjectProvider;
		let loader: Loader;
		let request: IRequest;
		const loaderContainerTracker = new LoaderContainerTracker();

		async function createDetachedContainerAndGetEntryPoint() {
			const container: IContainer = await loader.createDetachedContainer(codeDetails);
			// Get the root dataStore from the detached container.
			const defaultDataStore =
				await getContainerEntryPointBackCompat<TestFluidObject>(container);
			return {
				container,
				defaultDataStore,
			};
		}

		function createTestLoader(): Loader {
			// It's important to use data store runtime of the same version as DDSs!
			const factory = new apis.dataRuntime.TestFluidObjectFactory([
				[sharedStringId, SharedString.getFactory()],
				[sharedMapId, SharedMap.getFactory()],
				[crcId, ConsensusRegisterCollection.getFactory()],
				[sharedDirectoryId, SharedDirectory.getFactory()],
				[sharedCellId, SharedCell.getFactory()],
				[sharedMatrixId, SharedMatrix.getFactory()],
				[cocId, ConsensusQueue.getFactory()],
				[sparseMatrixId, SparseMatrix.getFactory()],
				[sharedCounterId, SharedCounter.getFactory()],
			]);

			// This dance is to ensure that we get reasonable version of IContainerRuntime.
			// If we do not set IRuntimeFactory property, LocalCodeLoader will use IContainerRuntime from current version
			// We only support limited (N/N-1) compatibility for container runtime and data stores, so that will not work.
			// Use version supplied by test framework
			const defaultFactory = createDataStoreFactory("default", factory);
			(defaultFactory as any).IRuntimeFactory =
				new apis.containerRuntime.ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory,
					registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
					runtimeOptions: {},
				});
			const codeLoader = new LocalCodeLoader([[codeDetails, defaultFactory]], {});

			// Use Loader supplied by test framework.
			const testLoader = new apis.loader.Loader({
				urlResolver: provider.urlResolver,
				documentServiceFactory: provider.documentServiceFactory,
				codeLoader,
				logger: provider.logger,
			});
			loaderContainerTracker.add(testLoader);
			return testLoader;
		}

		const createPeerDataStore = async (containerRuntime: IContainerRuntimeBase) => {
			const dataStore = await containerRuntime.createDataStore(["default"]);
			const peerDataStore =
				await getDataStoreEntryPointBackCompat<ITestFluidObject>(dataStore);
			return {
				peerDataStore,
				peerDataStoreRuntimeChannel: peerDataStore.channel,
			};
		};

		async function getDataObjectFromContainer(container: IContainer, key: string) {
			const entryPoint = await getContainerEntryPointBackCompat<TestFluidObject>(container);
			const handle: IFluidHandle<TestFluidObject> | undefined = entryPoint.root.get(key);
			assert(handle !== undefined, `handle for [${key}] must exist`);
			return handle.get();
		}

		function getSnapshotInfoFromSerializedContainer(container: IContainer): SnapshotWithBlobs {
			const snapshot = container.serialize();
			const deserializedSummary = JSON.parse(snapshot);
			return {
				baseSnapshot: deserializedSummary.baseSnapshot,
				snapshotBlobs: deserializedSummary.snapshotBlobs,
			};
		}

		beforeEach("createLoader", async function () {
			provider = getTestObjectProvider();
			if (
				// These tests use dedicated (same) version loader, container runtime, DDSs.
				// Thus there is no value in running more pairs that are essentially exactly the same as other tests.
				provider.type === "TestObjectProviderWithVersionedLoad" ||
				// These tests only work with the latest version of loader -
				// they do make certain assumptions that are not valid for older loaders. This check could be relaxed in
				// the future.
				apis.loader.version !== pkgVersion ||
				(semver.compare(provider.driver.version, "0.46.0") === -1 &&
					(provider.driver.type === "routerlicious" || provider.driver.type === "tinylicious"))
			) {
				this.skip();
			}
			const documentId = createDocumentId();
			request = provider.driver.createCreateNewRequest(documentId);
			loader = createTestLoader();
		});

		afterEach("resetLoaderContainerTracker", () => {
			loaderContainerTracker.reset();
		});

		const tests = () => {
			it("Dehydrated container snapshot", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();
				const { baseSnapshot, snapshotBlobs } =
					getSnapshotInfoFromSerializedContainer(container);

				// Check for protocol attributes
				const protocolTree = assertProtocolTree(baseSnapshot);
				assert.strictEqual(
					Object.keys(protocolTree.blobs).length,
					4,
					"4 protocol blobs should be there.",
				);

				const protocolAttributes = assertProtocolAttributes(baseSnapshot, snapshotBlobs);
				assert.strictEqual(
					protocolAttributes.sequenceNumber,
					detachedContainerRefSeqNumber,
					"initial aeq #",
				);
				assert(
					protocolAttributes.minimumSequenceNumber <= protocolAttributes.sequenceNumber,
					"Min Seq # <= seq #",
				);

				// Check blobs contents for protocolAttributes
				const protocolAttributesBlobId = baseSnapshot.trees[".protocol"]?.blobs.attributes;
				assert(
					snapshotBlobs[protocolAttributesBlobId] !== undefined,
					"Blobs should contain attributes blob",
				);

				// Check for default dataStore
				const { datastoreTree: snapshotDefaultDataStore } = assertDatastoreTree(
					baseSnapshot,
					defaultDataStore.runtime.id,
				);
				const datastoreAttributes = assertBlobContents<{ pkg: string }>(
					snapshotDefaultDataStore,
					snapshotBlobs,
					".component",
				);
				assert.strictEqual(
					datastoreAttributes.pkg,
					JSON.stringify(["default"]),
					"Package name should be default",
				);
			});

			it("Dehydrated container snapshot 2 times with changes in between", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();
				const { baseSnapshot: baseSnapshot1, snapshotBlobs: snapshotBlobs1 } =
					getSnapshotInfoFromSerializedContainer(container);
				// Create a channel
				const channel = defaultDataStore.runtime.createChannel(
					"test1",
					"https://graph.microsoft.com/types/map",
				) as ISharedMap;
				channel.bindToContext();
				const { baseSnapshot: baseSnapshot2, snapshotBlobs: snapshotBlobs2 } =
					getSnapshotInfoFromSerializedContainer(container);

				assert.strictEqual(
					JSON.stringify(Object.keys(baseSnapshot1.trees)),
					JSON.stringify(Object.keys(baseSnapshot2.trees)),
					"2 trees should be there(protocol, default dataStore",
				);

				// Check for protocol attributes
				const protocolAttributes1 = assertProtocolAttributes(baseSnapshot1, snapshotBlobs1);
				const protocolAttributes2 = assertProtocolAttributes(baseSnapshot2, snapshotBlobs2);
				assert.strictEqual(
					JSON.stringify(protocolAttributes1),
					JSON.stringify(protocolAttributes2),
					"Protocol attributes should be same as no change happened",
				);

				// Check for newly create channel
				const defaultChannelsTree1 = assertChannelsTree(
					assertDatastoreTree(baseSnapshot1, defaultDataStore.runtime.id).datastoreTree,
				);
				assert(
					defaultChannelsTree1.trees.test1 === undefined,
					"Test channel 1 should not be present in snapshot 1",
				);
				assertChannelTree(
					assertDatastoreTree(baseSnapshot2, defaultDataStore.runtime.id).datastoreTree,
					"test1",
					"Test channel 1 should be present in snapshot 2",
				);
			});

			it("Dehydrated container snapshot with dataStore handle stored in map of other bound dataStore", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// Create another dataStore
				const peerDataStore = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

				// Create a channel
				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				rootOfDataStore1.set("dataStore2", dataStore2.handle);

				const { baseSnapshot } = getSnapshotInfoFromSerializedContainer(container);

				assertProtocolTree(baseSnapshot);
				assertDatastoreTree(baseSnapshot, defaultDataStore.runtime.id);

				assertDatastoreTree(
					baseSnapshot,
					dataStore2.runtime.id,
					"Handle Bounded dataStore should be in summary",
				);
			});

			it("Rehydrate container from snapshot and check contents before attach", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();

				const snapshotTree = container.serialize();

				const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				// Check for default data store
				const defaultDataStore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container2);
				assert.notStrictEqual(defaultDataStore, undefined, "Component should exist!!");

				// Check for dds
				const sharedMap = await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const sharedDir =
					await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
				const sharedString =
					await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
				const sharedCell = await defaultDataStore.getSharedObject<ISharedCell>(sharedCellId);
				const sharedCounter =
					await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
				const crc =
					await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
				const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
				const sharedMatrix =
					await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
				const sparseMatrix =
					await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
				assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
				assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
				assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
				assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
				assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
				assert.strictEqual(crc.id, crcId, "CRC should exist!!");
				assert.strictEqual(coc.id, cocId, "COC should exist!!");
				assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
				assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
			});

			it("Rehydrate container from snapshot and check contents after attach", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();

				const snapshotTree = container.serialize();

				const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
				await container2.attach(request);

				// Check for default data store
				const defaultDataStore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container2);
				assert.notStrictEqual(defaultDataStore, undefined, "Component should exist!!");

				// Check for dds
				const sharedMap = await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const sharedDir =
					await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
				const sharedString =
					await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
				const sharedCell = await defaultDataStore.getSharedObject<ISharedCell>(sharedCellId);
				const sharedCounter =
					await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
				const crc =
					await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
				const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
				const sharedMatrix =
					await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
				const sparseMatrix =
					await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
				assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
				assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
				assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
				assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
				assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
				assert.strictEqual(crc.id, crcId, "CRC should exist!!");
				assert.strictEqual(coc.id, cocId, "COC should exist!!");
				assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
				assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
			});

			it("Rehydrate container multiple times round trip serialize/deserialize", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();
				let container1 = container;
				for (let i = 0; i < 5; ++i) {
					const snapshotTree1 = container1.serialize();
					container1 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree1);
				}

				// Check for default data store
				const defaultDataStore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container1);
				assert.notStrictEqual(defaultDataStore, undefined, "Component should exist!!");

				// Check for dds
				const sharedMap = await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const sharedDir =
					await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
				const sharedString =
					await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
				const sharedCell = await defaultDataStore.getSharedObject<ISharedCell>(sharedCellId);
				const sharedCounter =
					await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
				const crc =
					await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
				const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
				const sharedMatrix =
					await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
				const sparseMatrix =
					await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
				assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
				assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
				assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
				assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
				assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
				assert.strictEqual(crc.id, crcId, "CRC should exist!!");
				assert.strictEqual(coc.id, cocId, "COC should exist!!");
				assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
				assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
			});

			it("Storage in detached container", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();

				const snapshotTree = container.serialize();
				const defaultDataStore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container);
				assert(
					defaultDataStore.context.storage !== undefined,
					"Storage should be present in detached data store",
				);
				let success1: boolean | undefined;
				await defaultDataStore.context.storage.getSnapshotTree(undefined).catch((err) => {
					success1 = false;
				});
				assert(
					success1 === false,
					"Snapshot fetch should not be allowed in detached data store",
				);

				const container2: IContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
				const defaultDataStore2 =
					await getContainerEntryPointBackCompat<TestFluidObject>(container2);
				assert(
					defaultDataStore2.context.storage !== undefined,
					"Storage should be present in rehydrated data store",
				);
				let success2: boolean | undefined;
				await defaultDataStore2.context.storage.getSnapshotTree(undefined).catch((err) => {
					success2 = false;
				});
				assert(
					success2 === false,
					"Snapshot fetch should not be allowed in rehydrated data store",
				);
			});

			it("Change contents of dds, then rehydrate and then check summary", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();

				const defaultDataStoreBefore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container);
				const sharedStringBefore =
					await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
				const intervalsBefore = sharedStringBefore.getIntervalCollection("intervals");
				sharedStringBefore.insertText(0, "Hello");
				let interval0: SequenceInterval | undefined;
				let interval1: SequenceInterval | undefined;

				// The interval collection API was changed to uniformize `change`/`changeProperties` and addition of intervals.
				interface OldIntervalCollection {
					add(start: number, end: number, intervalType: number): SequenceInterval;
					change(id: string, start: number, end: number): SequenceInterval | undefined;
				}

				// Note: "dev" prereleases have to be special-cased since semver orders prerelease tags alphabetically,
				// so dev builds (i.e. -dev or -dev-rc) sort as before official internal releases.
				const isCurrentApi =
					apis.dataRuntime.version.includes("dev") ||
					semver.gte(apis.dataRuntime.version, "2.0.0-internal.8.0.0");

				if (!isCurrentApi) {
					// Versions of @fluidframework/sequence before this version had a different `add` API.
					// See https://github.com/microsoft/FluidFramework/commit/e5b463cc8b24a411581c3e48f62ce1eea68dd639
					// for the removal of that API.
					const slideOnRemove = 0x2;
					interval0 = (intervalsBefore as unknown as OldIntervalCollection).add(
						0,
						0,
						slideOnRemove,
					);
					interval1 = (intervalsBefore as unknown as OldIntervalCollection).add(
						0,
						1,
						slideOnRemove,
					);
				} else {
					interval0 = intervalsBefore.add({
						start: 0,
						end: 0,
					});
					interval1 = intervalsBefore.add({
						start: 0,
						end: 1,
					});
				}
				let id0;
				let id1;

				if (typeof intervalsBefore.change === "function") {
					id0 = interval0.getIntervalId();
					id1 = interval1.getIntervalId();
					assert.strictEqual(typeof id0, "string");
					assert.strictEqual(typeof id1, "string");
					if (!isCurrentApi) {
						// Versions of @fluidframework/sequence before this version had a different `change` API.
						// See https://github.com/microsoft/FluidFramework/commit/12c83d26962a1d76db6eb0ccad31fd6a7976a1af
						(intervalsBefore as unknown as OldIntervalCollection).change(id0, 2, 3);
						(intervalsBefore as unknown as OldIntervalCollection).change(id1, 0, 3);
					} else {
						intervalsBefore.change(id0, { start: 2, end: 3 });
						intervalsBefore.change(id1, { start: 0, end: 3 });
					}
				}

				const snapshotTree = container.serialize();

				const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				const defaultComponentAfter =
					await getContainerEntryPointBackCompat<TestFluidObject>(container2);
				const sharedStringAfter =
					await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
				const intervalsAfter = sharedStringAfter.getIntervalCollection("intervals");
				assert.strictEqual(
					JSON.stringify(sharedStringAfter.summarize()),
					JSON.stringify(sharedStringBefore.summarize()),
					"Summaries of shared string should match and contents should be same!!",
				);
				if (
					typeof intervalsBefore.change === "function" &&
					typeof intervalsAfter.change === "function"
				) {
					interval0 = intervalsAfter.getIntervalById(id0);
					assert.notStrictEqual(interval0, undefined);
					assert.strictEqual(interval0?.start.getOffset(), 2);
					assert.strictEqual(interval0?.end.getOffset(), 3);

					interval1 = intervalsAfter.getIntervalById(id1);
					assert.notStrictEqual(interval1, undefined);
					assert.strictEqual(interval1?.start.getOffset(), 0);
					assert.strictEqual(interval1?.end.getOffset(), 3);
				}
				for (const interval of intervalsBefore) {
					if (typeof interval?.getIntervalId === "function") {
						const id = interval.getIntervalId();
						assert.strictEqual(typeof id, "string");
						if (id) {
							assert.notStrictEqual(
								intervalsAfter.getIntervalById(id),
								undefined,
								"Interval not present after rehydration",
							);
							intervalsAfter.removeIntervalById(id);
							assert.strictEqual(
								intervalsAfter.getIntervalById(id),
								undefined,
								"Interval not deleted",
							);
						}
					}
				}
				for (const interval of intervalsAfter) {
					assert.fail(
						`Unexpected interval after rehydration: ${interval?.start.getOffset()}-${interval?.end.getOffset()}`,
					);
				}
			});

			it("Rehydrate container from summary, change contents of dds and then check summary", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();
				let str = "AA";
				const defaultComponent1 =
					await getContainerEntryPointBackCompat<TestFluidObject>(container);
				const sharedString1 =
					await defaultComponent1.getSharedObject<SharedString>(sharedStringId);
				sharedString1.insertText(0, str);
				const snapshotTree = container.serialize();

				const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
				const defaultDataStoreBefore =
					await getContainerEntryPointBackCompat<TestFluidObject>(container2);
				const sharedStringBefore =
					await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
				const sharedMapBefore =
					await defaultDataStoreBefore.getSharedObject<ISharedMap>(sharedMapId);
				str += "BB";
				sharedStringBefore.insertText(0, str);
				sharedMapBefore.set("0", str);

				await container2.attach(request);
				const defaultComponentAfter =
					await getContainerEntryPointBackCompat<TestFluidObject>(container);
				const sharedStringAfter =
					await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
				const sharedMapAfter =
					await defaultComponentAfter.getSharedObject<ISharedMap>(sharedMapId);
				assert.strictEqual(
					JSON.stringify(sharedStringAfter.summarize()),
					JSON.stringify(sharedStringBefore.summarize()),
					"Summaries of shared string should match and contents should be same!!",
				);
				assert.strictEqual(
					JSON.stringify(sharedMapAfter.summarize()),
					JSON.stringify(sharedMapBefore.summarize()),
					"Summaries of shared map should match and contents should be same!!",
				);
			});

			// biome-ignore format: https://github.com/biomejs/biome/issues/4202
			it(
				"Rehydrate container, don't load a data store and then load after container attachment. Make changes to " +
					"dds from rehydrated container and check reflection of changes in other container",
				async () => {
					const { container, defaultDataStore } =
						await createDetachedContainerAndGetEntryPoint();

					// Create and reference another dataStore
					const { peerDataStore: dataStore2 } = await createPeerDataStore(
						defaultDataStore.context.containerRuntime,
					);
					const dataStore2Key = "dataStore2";
					defaultDataStore.root.set(dataStore2Key, dataStore2.handle);
					await provider.ensureSynchronized();

					const sharedMap1 = await dataStore2.getSharedObject<ISharedMap>(sharedMapId);
					sharedMap1.set("0", "A");
					const snapshotTree = container.serialize();
					// close the container that we don't use any more, so it doesn't block ensureSynchronized()
					container.close(DisconnectReason.Expected);

					const rehydratedContainer =
						await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
					await rehydratedContainer.attach(request);

					// Now load the container from another loader.
					const urlResolver2 = provider.urlResolver;
					const loader2 = createTestLoader();
					assert(rehydratedContainer.resolvedUrl);
					const requestUrl2 = await urlResolver2.getAbsoluteUrl(
						rehydratedContainer.resolvedUrl,
						"",
					);
					const container2 = await loader2.resolve({ url: requestUrl2 });

					// Get the sharedString1 from dataStore2 in rehydrated container.
					const dataStore2FromRC = await getDataObjectFromContainer(
						rehydratedContainer,
						dataStore2Key,
					);
					const sharedMapFromRC =
						await dataStore2FromRC.getSharedObject<ISharedMap>(sharedMapId);
					sharedMapFromRC.set("1", "B");

					const dataStore3 = await getDataObjectFromContainer(container2, dataStore2Key);
					const sharedMap3 = await dataStore3.getSharedObject<ISharedMap>(sharedMapId);

					await loaderContainerTracker.ensureSynchronized();
					assert.strictEqual(sharedMap3.get("1"), "B", "Contents should be as required");
					assert.strictEqual(
						JSON.stringify(sharedMap3.summarize()),
						JSON.stringify(sharedMapFromRC.summarize()),
						"Summaries of shared string should match and contents should be same!!",
					);
				},
			);

			// biome-ignore format: https://github.com/biomejs/biome/issues/4202
			it(
				"Rehydrate container, create but don't load a data store. Attach rehydrated container and load " +
					"container 2 from another loader. Then load the created dataStore from container 2, make changes to dds " +
					"in it check reflection of changes in rehydrated container",
				async function () {
					const { container, defaultDataStore } =
						await createDetachedContainerAndGetEntryPoint();

					// Create and reference another dataStore
					const { peerDataStore: dataStore2 } = await createPeerDataStore(
						defaultDataStore.context.containerRuntime,
					);
					const dataStore2Key = "dataStore2";
					defaultDataStore.root.set(dataStore2Key, dataStore2.handle);
					await provider.ensureSynchronized();

					const sharedMap1 = await dataStore2.getSharedObject<ISharedMap>(sharedMapId);
					sharedMap1.set("0", "A");
					const snapshotTree = container.serialize();
					// close the container that we don't use any more, so it doesn't block ensureSynchronized()
					container.close(DisconnectReason.Expected);

					const rehydratedContainer =
						await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
					await rehydratedContainer.attach(request);

					// Now load the container from another loader.
					const urlResolver2 = provider.urlResolver;
					const loader2 = createTestLoader();
					assert(rehydratedContainer.resolvedUrl);
					const requestUrl2 = await urlResolver2.getAbsoluteUrl(
						rehydratedContainer.resolvedUrl,
						"",
					);
					const container2 = await loader2.resolve({ url: requestUrl2 });

					// Get the sharedString1 from dataStore2 in container2.
					const dataStore3 = await getDataObjectFromContainer(container2, dataStore2Key);
					const sharedMap3 = await dataStore3.getSharedObject<ISharedMap>(sharedMapId);
					sharedMap3.set("1", "B");

					// Get the sharedString1 from dataStore2 in rehydrated container.
					const dataStore2FromRC = await getDataObjectFromContainer(
						rehydratedContainer,
						dataStore2Key,
					);
					const sharedMapFromRC =
						await dataStore2FromRC.getSharedObject<ISharedMap>(sharedMapId);

					await loaderContainerTracker.ensureSynchronized();
					assert.strictEqual(
						sharedMapFromRC.get("1"),
						"B",
						"Changes should be reflected in other map",
					);
					assert.strictEqual(
						JSON.stringify(sharedMap3.summarize()),
						JSON.stringify(sharedMapFromRC.summarize()),
						"Summaries of shared string should match and contents should be same!!",
					);
				},
			);

			it("Container rehydration with not bounded dataStore handle stored in root of other bounded dataStore", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// Create another dataStore
				const peerDataStore = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const dataStore2Key = "dataStore2";
				rootOfDataStore1.set(dataStore2Key, dataStore2.handle);

				const snapshotTree = container.serialize();
				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				const rehydratedEntryPoint =
					await getContainerEntryPointBackCompat<TestFluidObject>(rehydratedContainer);
				const rehydratedRootOfDataStore =
					await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
				const dataStore2Handle: IFluidHandle<TestFluidObject> | undefined =
					rehydratedRootOfDataStore.get(dataStore2Key);
				assert(dataStore2Handle !== undefined, `handle for [${dataStore2Key}] must exist`);
				const dataStore2FromRC = await dataStore2Handle.get();
				assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
				assert.strictEqual(
					dataStore2FromRC.runtime.id,
					dataStore2.runtime.id,
					"DataStore2 id should match",
				);
			});

			it("Container rehydration with not bounded dds handle stored in root of bounded dataStore", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// Create another not bounded dds
				const ddsId = "notbounddds";
				const dds2 = defaultDataStore.runtime.createChannel(
					ddsId,
					SharedString.getFactory().type,
				);

				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const dds2Key = "dds2";
				rootOfDataStore1.set(dds2Key, dds2.handle);

				const snapshotTree = container.serialize();
				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				const rehydratedEntryPoint =
					await getContainerEntryPointBackCompat<TestFluidObject>(rehydratedContainer);
				const rootOfDds2 = await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
				const dds2Handle: IFluidHandle<ISharedMap> | undefined = rootOfDds2.get(dds2Key);
				assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
				const dds2FromRC = await dds2Handle.get();
				assert(dds2FromRC, "ddd2 should have been serialized properly");
				assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
				assert.strictEqual(dds2FromRC.id, dds2.id, "Both dds id should match");
			});

			// biome-ignore format: https://github.com/biomejs/biome/issues/4202
			it(
				"Container rehydration with not bounded dds handle stored in root of bound dataStore. The not bounded dds " +
					"also stores handle not bounded data store",
				async () => {
					const { container, defaultDataStore } =
						await createDetachedContainerAndGetEntryPoint();

					// Create another not bounded dataStore
					const peerDataStore = await createPeerDataStore(
						defaultDataStore.context.containerRuntime,
					);
					const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

					// Create another not bounded dds
					const ddsId = "notbounddds";
					const dds2 = defaultDataStore.runtime.createChannel(
						ddsId,
						SharedMap.getFactory().type,
					) as ISharedMap;
					const dataStore2Key = "dataStore2";
					dds2.set(dataStore2Key, dataStore2.handle);

					const rootOfDataStore1 =
						await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
					const dds2Key = "dds2";
					rootOfDataStore1.set(dds2Key, dds2.handle);

					const snapshotTree = container.serialize();
					const rehydratedContainer =
						await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

					const rehydratedEntryPoint =
						await getContainerEntryPointBackCompat<TestFluidObject>(rehydratedContainer);
					const rootOfDds2 =
						await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
					const dds2Handle: IFluidHandle<ISharedMap> | undefined = rootOfDds2.get(dds2Key);
					assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
					const dds2FromRC = await dds2Handle.get();

					assert(dds2FromRC, "dds2 should have been serialized properly");
					assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
					assert.strictEqual(dds2FromRC.id, dds2.id, "Both dds id should match");

					const dataStore2Handle: IFluidHandle<TestFluidObject> | undefined =
						dds2FromRC.get(dataStore2Key);
					assert(dataStore2Handle !== undefined, `handle for [${dataStore2Key}] must exist`);
					const dataStore2FromRC = await dataStore2Handle.get();
					assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
					assert.strictEqual(
						dataStore2FromRC.runtime.id,
						dataStore2.runtime.id,
						"DataStore2 id should match",
					);
				},
			);

			// biome-ignore format: https://github.com/biomejs/biome/issues/4202
			it(
				"Container rehydration with not bounded data store handle stored in root of bound dataStore. " +
					"The not bounded data store also stores handle not bounded dds",
				async () => {
					const { container, defaultDataStore } =
						await createDetachedContainerAndGetEntryPoint();

					// Create another not bounded dataStore
					const peerDataStore = await createPeerDataStore(
						defaultDataStore.context.containerRuntime,
					);
					const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

					// Create another not bounded dds
					const ddsId = "notbounddds";
					const dds2 = dataStore2.runtime.createChannel(
						ddsId,
						SharedMap.getFactory().type,
					) as ISharedMap;
					const rootOfDataStore2 = await dataStore2.getSharedObject<ISharedMap>(sharedMapId);
					const dds2Key = "dds2";
					rootOfDataStore2.set(dds2Key, dds2.handle);

					const rootOfDataStore1 =
						await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
					const dataStore2Key = "dataStore2";
					rootOfDataStore1.set(dataStore2Key, dataStore2.handle);

					const snapshotTree = container.serialize();
					const rehydratedContainer =
						await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

					const rehydratedEntryPoint =
						await getContainerEntryPointBackCompat<TestFluidObject>(rehydratedContainer);
					const rehydratedRootOfDataStore2 =
						await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
					const dataStore2Handle: IFluidHandle<TestFluidObject> | undefined =
						rehydratedRootOfDataStore2.get(dataStore2Key);
					assert(dataStore2Handle !== undefined, `handle for [${dataStore2Key}] must exist`);
					const dataStore2FromRC = await dataStore2Handle.get();

					const rootOfDds2 = await dataStore2FromRC.getSharedObject<ISharedMap>(sharedMapId);
					const dds2Handle: IFluidHandle<ISharedMap> | undefined = rootOfDds2.get(dds2Key);
					assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
					const dds2FromRC = await dds2Handle.get();
					assert(dds2FromRC, "ddd2 should have been serialized properly");
					assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
					assert.strictEqual(dds2FromRC.id, dds2.id, "Both dds id should match");

					assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
					assert.strictEqual(
						dataStore2FromRC.runtime.id,
						dataStore2.runtime.id,
						"DataStore2 id should match",
					);
				},
			);

			it("Not bounded/Unreferenced data store should not get serialized on container serialization", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// Create another not bounded dataStore
				await createPeerDataStore(defaultDataStore.context.containerRuntime);

				const { baseSnapshot } = getSnapshotInfoFromSerializedContainer(container);

				assertProtocolTree(baseSnapshot);
				assertDatastoreTree(baseSnapshot, defaultDataStore.runtime.id);
			});
		};

		it("can rehydrate from arbitrary summary that is not generated from serialized container", async () => {
			const summaryTree = buildSummaryTree(baseAttributes, baseQuorum, baseSummarizer);
			const summaryString = JSON.stringify(summaryTree);

			await assert.doesNotReject(loader.rehydrateDetachedContainerFromSnapshot(summaryString));
		});

		it("can rehydrate from summary that does not start with seq. #0", async () => {
			const attr = {
				...baseAttributes,
				sequenceNumber: 5,
			};
			const summaryTree = buildSummaryTree(attr, baseQuorum, baseSummarizer);
			const summaryString = JSON.stringify(summaryTree);

			await assert.doesNotReject(loader.rehydrateDetachedContainerFromSnapshot(summaryString));
		});

		// Run once with isolated channels
		tests();
	},
);
