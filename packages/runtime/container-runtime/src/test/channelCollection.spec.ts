/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { ConfigTypes } from "@fluidframework/core-interfaces";
import type {
	ISnapshotTree,
	ISequencedDocumentMessage,
	ITree,
} from "@fluidframework/driver-definitions/internal";
import type {
	IAttachMessage,
	IRuntimeMessageCollection,
} from "@fluidframework/runtime-definitions/internal";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	DataCorruptionError,
	DataProcessingError,
	MockLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import {
	ChannelCollection,
	detectOutboundReferences,
	getSummaryForDatastores,
	type IFluidRootParentContextPrivate,
} from "../channelCollection.js";
import type { LocalFluidDataStoreContext } from "../dataStoreContext.js";
import type { DataStoreContexts } from "../dataStoreContexts.js";
import { ContainerMessageType } from "../messageTypes.js";
import { type IContainerRuntimeMetadata, nonDataStorePaths } from "../summary/index.js";

import {
	createParentContext,
	createSummarizerNodeAndGetCreateFn,
} from "./dataStoreCreationHelper.js";

describe("Runtime", () => {
	describe("ChannelCollection", () => {
		describe("getSummaryForDatastores", () => {
			const enabledMetadata: IContainerRuntimeMetadata = {
				summaryFormatVersion: 1,
				message: undefined,
			};
			const disabledMetadata: IContainerRuntimeMetadata = {
				summaryFormatVersion: 1,
				disableIsolatedChannels: true,
				message: undefined,
			};

			const emptyTree = (id: string): ISnapshotTree => ({
				id,
				blobs: {},
				trees: {},
			});
			const testSnapshot: ISnapshotTree = {
				id: "root-id",
				blobs: {},
				trees: {
					[channelsTreeName]: {
						id: "channels-id",
						blobs: {},
						trees: {
							[nonDataStorePaths[0]]: emptyTree("lower-non-datastore-1"),
							"some-datastore": emptyTree("lower-datastore-1"),
							[nonDataStorePaths[1]]: emptyTree("lower-non-datastore-2"),
							"another-datastore": emptyTree("lower-datastore-2"),
						},
					},
					[nonDataStorePaths[0]]: emptyTree("top-non-datastore-1"),
					"some-datastore": emptyTree("top-datastore-1"),
					[nonDataStorePaths[1]]: emptyTree("top-non-datastore-2"),
					"another-datastore": emptyTree("top-datastore-2"),
				},
			};

			it("Should return undefined for undefined snapshots", () => {
				let snapshot = getSummaryForDatastores(undefined, undefined);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, enabledMetadata);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, disabledMetadata);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, undefined);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(
					undefined as unknown as ISnapshotTree,
					enabledMetadata,
				);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(
					undefined as unknown as ISnapshotTree,
					disabledMetadata,
				);
				assert(snapshot === undefined);
			});

			it("Should strip out non-datastore paths for versions < 1", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, undefined);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "root-id", "Should be top-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 3, "Should have 3 datastores");
				assert.strictEqual(
					snapshot.trees[channelsTreeName]?.id,
					"channels-id",
					"Should have channels tree as datastore",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"top-datastore-1",
					"Should have top datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"top-datastore-2",
					"Should have top datastore 2",
				);
			});

			it("Should strip out non-datastore paths for disabled isolated channels", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, disabledMetadata);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "root-id", "Should be top-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 3, "Should have 3 datastores");
				assert.strictEqual(
					snapshot.trees[channelsTreeName]?.id,
					"channels-id",
					"Should have channels tree as datastore",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"top-datastore-1",
					"Should have top datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"top-datastore-2",
					"Should have top datastore 2",
				);
			});

			it("Should give channels subtree for version 1", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, enabledMetadata);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "channels-id", "Should be lower-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 4, "Should have 4 datastores");
				// Put in variable to avoid type-narrowing bug
				const nonDataStore1: ISnapshotTree | undefined = snapshot.trees[nonDataStorePaths[0]];
				assert.strictEqual(
					nonDataStore1?.id,
					"lower-non-datastore-1",
					"Should have lower non-datastore 1",
				);
				assert.strictEqual(
					snapshot.trees[nonDataStorePaths[1]]?.id,
					"lower-non-datastore-2",
					"Should have lower non-datastore 2",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"lower-datastore-1",
					"Should have lower datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"lower-datastore-2",
					"Should have lower datastore 2",
				);
			});
		});
		describe("detectOutboundReferences", () => {
			it("Can find handles", () => {
				const outboundReferences: [string, string][] = [];
				detectOutboundReferences(
					"dataStore1",
					{
						address: "dds1",
						someHandle: {
							type: "__fluid_handle__",
							url: "routeA",
						},
						nested: {
							anotherHandle: {
								type: "__fluid_handle__",
								url: "routeB",
							},
							address: "ignored",
						},
						array: [
							{
								type: "__fluid_handle__",
								url: "routeC",
							},
							{
								type: "__fluid_handle__",
								url: "routeD",
							},
						],
						// eslint-disable-next-line unicorn/no-null
						deadEnd: null,
						number: 1,
						nothing: undefined,
					},
					(from, to) => {
						outboundReferences.push([from, to]);
					},
				);
				assert.deepEqual(
					outboundReferences,
					[
						["/dataStore1/dds1", "routeA"],
						["/dataStore1/dds1", "routeB"],
						["/dataStore1/dds1", "routeC"],
						["/dataStore1/dds1", "routeD"],
					],
					"Should find both handles",
				);
			});
			it("null contents", () => {
				// eslint-disable-next-line unicorn/no-null
				detectOutboundReferences("foo", null, () => {
					assert.fail("Should not be called");
				});
			});
		});

		describe("processAttachMessages - Duplicate ID Detection", () => {
			/* eslint-disable @typescript-eslint/consistent-type-assertions */
			let channelCollection: ChannelCollection;
			let mockLogger: MockLogger;
			let parentContext: IFluidRootParentContextPrivate;

			const createMockAttachMessage = (
				id: string,
				type: string = "TestDataStore",
			): IAttachMessage => {
				const message: IAttachMessage = {
					id,
					type,
					snapshot: { id: "snapshot-id", entries: [], blobs: [] } as ITree,
				};
				return message;
			};
			const createMockMessageCollection = (
				attachMessage: IAttachMessage,
				local: boolean = false,
				sequenceNumber: number = 1,
			): IRuntimeMessageCollection => {
				const messageCollection: IRuntimeMessageCollection = {
					envelope: {
						type: ContainerMessageType.Attach,
						contents: attachMessage,
						sequenceNumber,
						clientId: local ? "local-client" : "remote-client",
						timestamp: Date.now(),
					} as ISequencedDocumentMessage,
					messagesContent: [
						{
							contents: attachMessage,
							localOpMetadata: undefined,
							clientSequenceNumber: 1,
						},
					],
					local,
				};
				return messageCollection;
			};
			const configProvider = (settings: Record<string, ConfigTypes>) => ({
				getRawConfig: (name: string): ConfigTypes => settings[name],
			});
			beforeEach(() => {
				mockLogger = new MockLogger();
				const mc = mixinMonitoringContext(
					mockLogger,
					configProvider({
						"Fluid.Runtime.DisableShortIds": true,
					}),
				);
				const baseParentContext = createParentContext(mc.logger);

				// Create a proper IFluidRootParentContextPrivate with root-level submitMessage/submitSignal
				parentContext = {
					...baseParentContext,
					attachState: AttachState.Attached,
					submitMessage: (_containerRuntimeMessage: unknown, _localOpMetadata: unknown) => {},
					submitSignal: (_envelope: unknown, _targetClientId?: string) => {},
					addedGCOutboundRoute: () => {},
					makeLocallyVisible: () => {},
					getExtension: () => undefined,
					getCreateChildSummarizerNodeFn: (id: string) => {
						const fn = createSummarizerNodeAndGetCreateFn(id).createSummarizerNodeFn;
						return fn;
					},
				} as unknown as IFluidRootParentContextPrivate;

				channelCollection = new ChannelCollection(
					undefined, // baseSnapshot
					parentContext,
					mockLogger,
					() => {}, // gcNodeUpdated
					() => false, // isDataStoreDeleted
					new Map(), // aliasMap
				);
			});

			it("should throw DataProcessingError for duplicate ID with unbound (not-yet-attached) DataStore", () => {
				// Create a local DataStore context (it's unbound) and get its ID so we can simulate a remote attach with the same ID
				const localContext = channelCollection.createDataStoreContext(["TestPackage"]);
				const dataStoreId = localContext.id;

				// Try to process a remote attach message with the same ID
				const attachMessage = createMockAttachMessage(dataStoreId);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should throw DataProcessingError
				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection);
					},
					(error: Error) => {
						assert(error instanceof DataProcessingError, "Expected DataProcessingError");
						assert(
							error.message.includes("Local DataStore matches remote DataStore id"),
							`Expected error message about local DataStore match, got: ${error.message}`,
						);
						return true;
					},
					"Should throw DataProcessingError for unbound context collision",
				);
			});

			for (const state of [AttachState.Attaching, AttachState.Attached]) {
				it(`should throw DataCorruptionError for duplicate ID with ${state} DataStore`, () => {
					// Create a local DataStore context and make it bound/attached
					const localContext = channelCollection.createDataStoreContext([
						"TestPackage",
					]) as LocalFluidDataStoreContext;
					const dataStoreId = localContext.id;

					// Simulate localContext.makeLocallyVisible()
					localContext.setAttachState(AttachState.Attaching);
					(
						channelCollection as unknown as { readonly contexts: DataStoreContexts }
					).contexts.bind(dataStoreId);

					// If we're testing Attaching state, we're already there.
					// If testing Attached, simulate receiving the attach op and transitioning to that state.
					if (state === AttachState.Attached) {
						localContext.setAttachState(AttachState.Attached);
					}

					// Try to process a remote attach message with the same ID
					const attachMessage = createMockAttachMessage(dataStoreId);
					const messageCollection = createMockMessageCollection(attachMessage, false);

					// Should throw DataCorruptionError
					assert.throws(
						() => {
							channelCollection.processMessages(messageCollection);
						},
						(error: Error) => {
							assert(error instanceof DataCorruptionError, "Expected DataCorruptionError");
							assert(
								error.message.includes("Duplicate DataStore created with existing id"),
								`Expected error message about duplicate DataStore, got: ${error.message}`,
							);
							return true;
						},
						"Should throw DataCorruptionError for bound context collision",
					);
				});
			}

			it("should throw DataCorruptionError for duplicate ID with aliased DataStore", () => {
				const alias = "my-alias";

				// Create a datastore and alias it
				const localContext = channelCollection.createDataStoreContext([
					"TestPackage",
				]) as LocalFluidDataStoreContext;
				const dataStoreId = localContext.id;

				localContext.setAttachState(AttachState.Attaching);
				localContext.setAttachState(AttachState.Attached);
				(
					channelCollection as unknown as { readonly contexts: DataStoreContexts }
				).contexts.bind(dataStoreId);

				// Simulate aliasing (which is usually mediated by ops)
				(
					channelCollection as unknown as { readonly aliasMap: Map<string, string> }
				).aliasMap.set(alias, dataStoreId);

				// Simulate an incoming attach message with the same alias
				const attachMessage = createMockAttachMessage(alias);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should throw DataCorruptionError
				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection);
					},
					(error: Error) => {
						assert(error instanceof DataCorruptionError, "Expected DataCorruptionError");
						assert(
							error.message.includes("Duplicate DataStore created with existing id"),
							`Expected error message about duplicate DataStore, got: ${error.message}`,
						);
						return true;
					},
					"Should throw DataCorruptionError for aliased context collision",
				);
			});
			/* eslint-enable @typescript-eslint/consistent-type-assertions */
		});
	});
});
